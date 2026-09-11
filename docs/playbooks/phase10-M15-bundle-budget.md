# Playbook فاز ۱۰: M15 - Bundle Budget

> وضعیت: برنامه‌ریزی‌شده · دامنه: فقط مستندسازی و تعریف اجرای بعدی
> پیش‌نیاز: فاز ۵ CI/CD و ADR-0037 · مرتبط: `docs/DESIGN-V2.md` §14.2 و §14.4
>
> این سند **هیچ تغییر کدی را انجام نمی‌دهد**. هدف آن شکستن M15 به دو گام قابل اجرا و قابل ممیزی است.

## هدف M15

Bundle budget باید بر اساس خروجی واقعی build وب سنجیده شود و در CI **الزام‌آور** باشد. سقف فعلی **۳۰۷٬۲۰۰ بایت gzip** خط قرمز است و حجم فعلی حدود **۲۰۵٬۰۵۸ بایت** است.

### وضعیت فعلی: چه چیزی الان کار می‌کند

مهم: **graph analysis واقعی قبلاً در فاز ۵ انجام شده است** و M15 از صفر شروع نمی‌شود:

- `apps/web/vite.config.ts` با `manifest: true` manifest واقعی Vite را تولید می‌کند.
- `tools/bundle-budget.ts` همین manifest را می‌خواند و graph importهای **static** را از هر entry chunk پیمایش می‌کند (entry + importهای تراکنشی + CSS).
- `dynamicImports` از payload اولیه کنار گذاشته می‌شود و به‌عنوان lazy گزارش می‌شود.
- نبود manifest یا نبود entry chunk باعث `exit 1` می‌شود، نه گزارش صفر بایت.
- `.github/workflows/ci.yml` پس از build، `npm run budget:bundle` را درون `run-gate.sh` اجرا می‌کند.

شواهد اجرای فعلی (تأییدشده):

```text
npm run budget:bundle   -> 205058 B gz / limit 307200 B - OK
npm run graph -- --check -> exit 0
npm run conformance      -> 12 rules, 0 violations
```

### شکاف واقعی باقیمانده

1. خروجی ابزار فعلاً فقط متن کنسول است؛ JSON ماشین‌خوان و schema‌دار ندارد (قابل diff نیست).
2. سقف از `BUNDLE_BUDGET_BYTES` خوانده می‌شود، پس با یک env می‌توان در CI آن را بالا برد و gate را بی‌اثر کرد. policy نسخه‌گذاری‌شده وجود ندارد.
3. هیچ regression testی مخصوص M15 در `tools/quality/product.phase10.spec.ts` نیست؛ failure-path اثبات نشده است.

پس وزن کار روی **M15b (enforcement)** است، نه M15a.

## فازبندی

### M15a: بهبود schema خروجی (گام کوچک)

**graph analysis قبلاً وجود دارد.** این فاز ابزار جدید (madge/depcheck) اضافه نمی‌کند و traversal را بازنویسی نمی‌کند. تنها کار: همان داده‌ی موجود به شکل JSON ساختارمند و deterministic هم منتشر شود تا M15b بتواند روی آن policy اعمال کند.

**خروجی مورد انتظار:** یک گزارش JSON شامل `schemaVersion`، فهرست فایل‌های payload اولیه با اندازه‌ی gzip، فهرست chunkهای lazy و جمع کل در کنار limit.

**Acceptance criteria M15a:**

- graph analysis موجود دست نخورده باقی می‌ماند: همان پیمایش static از manifest، همان حذف `dynamicImports`.
- کنار خروجی متنی فعلی، یک JSON دارای `schemaVersion` تولید می‌شود.
- خروجی deterministic است: دو اجرا روی همان build دقیقاً یکسان، بدون timestamp و بدون مسیر محلی.
- عدد کل JSON با عدد گزارش متنی یکی است (امروز ۲۰۵٬۰۵۸ B).
- نبود manifest همان‌طور که امروز هست `exit 1` می‌ماند.
- گزارش artifact است و commit نمی‌شود.

**فایل‌های مورد نیاز برای تغییر:**

- `tools/bundle-budget.ts` - افزودن schema و خروجی JSON.
- `apps/web/vite.config.ts` - فقط در صورت نیاز به metadata بیشتر؛ `manifest: true` الان کافی است.

**دستورات test/verify M15a:**

```bash
npm ci --legacy-peer-deps
npm run build
npm run budget:bundle
```

### M15b: budget enforcement در CI (بخش اصلی M15)

**این مهم‌ترین کار باقیمانده‌ی M15 است.** امروز گیت در CI اجرا می‌شود ولی سقف آن از یک environment variable می‌آید؛ یعنی قابل دور زدن است و هیچ تستی هم ثابت نمی‌کند که تخطی واقعاً قرمز می‌شود.

**سیاست پیشنهادی:**

- hard limit در یک policy نسخه‌گذاری‌شده نگه داشته شود، نه در env. مقدار env فقط برای تست محلی failure-path مجاز باشد.
- تجاوز از سقف باید با `exit 1` و پیام حاوی total، limit، delta و بزرگ‌ترین مصرف‌کننده‌ها fail کند.
- افزایش سقف فقط با تغییر صریح policy و دلیل مستند مجاز باشد؛ افزایش خاموش ممنوع.
- کاهش واقعی حجم به صورت ratchet در گزارش دیده شود، اما خودکار limit را تغییر ندهد.
- command، خروجی کامل و exit code طبق ADR-0037 در `ci-evidence` بماند و توسط job نهایی `gate` بازخوانی شود.

**Acceptance criteria M15b:**

- build سالم با payload زیر ۳۰۷٬۲۰۰ B gzip سبز می‌شود.
- سناریوی عمدی بالاتر از limit با `exit 1` قرمز می‌شود (failure-path اثبات شده، نه فرض‌شده).
- بالا بردن سقف فقط با env دیگر گیت CI را سبز نمی‌کند.
- نبود manifest، نبود report یا خطای اندازه‌گیری fail می‌شود، نه صفر گزارش می‌شود.
- پیام failure شامل limit، مقدار واقعی و مقدار تجاوز است.
- شواهد در artifact CI موجود است و `npm run ci:gate` بدون لاگ سبز نمی‌شود.
- regression test در `tools/quality/product.phase10.spec.ts` enforcement را قفل می‌کند.

**فایل‌های مورد نیاز برای تغییر:**

- policy فایل جدید، مثلاً `tools/bundle-budget.policy.json`.
- `tools/bundle-budget.ts` - خواندن policy و منطق ratchet.
- `.github/workflows/ci.yml` - enforce، upload artifact و اتصال به evidence gate.
- `tools/quality/product.phase10.spec.ts` - تست hard limit و failure-path.
- `package.json` - فقط در صورت افزودن command جدید.

**دستورات test/verify M15b:**

```bash
npm ci --legacy-peer-deps
npm run build
npm run budget:bundle
npm test -- tools/quality/product.phase10.spec.ts
npm run conformance
npm run graph -- --check
npm run ci:gate
```

برای failure-path، limit فقط در محیط تست پایین آورده شود و policy مخزن تغییر نکند؛ انتظار می‌رود checker با `exit 1` و پیام delta خارج شود.

## ترتیب اجرا و مرز دامنه

1. M15a کوتاه: فقط schema و خروجی deterministic روی graph موجود.
2. M15b اصلی: policy، hard limit، failure-path و شواهد CI.
3. بعد از اجرای سبز، شواهد commit/CI ثبت و M15 فقط با evidence تیک بخورد.

خارج از دامنه: بازنویسی traversal موجود، افزودن madge/depcheck، refactor componentها، lazy-loading جدید، حذف dependency و هر کاری که حجم bundle را پایین می‌آورد.

## Definition of Done

- گزارش JSON schema‌دار و قابل بازتولید وجود دارد.
- hard limit از policy می‌آید و در CI قابل دور زدن نیست.
- تخطی عمدی قرمز می‌شود و در تست ثابت شده است.
- artifact شواهد شامل command، report و exit code است.
- conformance و graph --check سبز می‌مانند.
- `docs/WEAKNESSES-V2-10-PHASES.md` در گام جداگانه و فقط پس از شواهد به‌روزرسانی شود.

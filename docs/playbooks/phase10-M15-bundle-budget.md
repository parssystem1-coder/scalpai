# Playbook فاز ۱۰: M15 - Bundle Budget

> وضعیت: برنامه‌ریزی‌شده · دامنه: فقط مستندسازی و تعریف اجرای بعدی
> پیش‌نیاز: فاز ۵ CI/CD و ADR-0037 · مرتبط: `docs/DESIGN-V2.md` §14.2 و §14.4
>
> این سند **هیچ تغییر کدی را انجام نمی‌دهد**. هدف آن شکستن M15 به دو گام قابل اجرا و قابل ممیزی است.

## هدف M15

Bundle budget باید بر اساس خروجی واقعی build وب سنجیده شود، نه برآورد اسمی یا فهرست دستی فایل‌ها. سقف فعلی **۳۰۷٬۲۰۰ بایت gzip** خط قرمز است و حجم فعلی حدود **۲۰۵٬۰۵۸ بایت** گزارش شده است. خروجی نهایی باید به‌صورت deterministic و machine-readable تولید شود، در CI enforce شود و هنگام تخطی با شواهد قابل بررسی fail کند.

وضعیت فعلی مبنا:

- `apps/web/vite.config.ts` manifest واقعی Vite را فعال می‌کند.
- `tools/bundle-budget.ts` entry chunkها، importهای static و CSS آن‌ها را پیمایش می‌کند.
- importهای dynamic در payload اولیه محاسبه نمی‌شوند.
- `.github/workflows/ci.yml` پس از build، `npm run budget:bundle` را اجرا می‌کند.
- شکاف M15: خروجی graph/budget باید schema‌دار، deterministic، قابل diff و دارای policy نسخه‌گذاری‌شده باشد؛ همچنین acceptance و regression مخصوص M15 باید صریحاً در quality gate ثبت شود.

## فازبندی

### M15a: graph analysis واقعی و گزارش JSON

**هدف:** استخراج graph واقعی از manifest/build و ارائه‌ی رابطه‌ی entry، chunk، import static/dynamic و سهم بایت هر بخش در قالب JSON قابل مصرف توسط ابزارها و CI.

**طراحی پیشنهادی:**

1. از metadata خود Rollup/Vite در زمان build استفاده شود؛ افزودن `madge` یا `depcheck` فقط در صورت اثبات نیاز انجام شود. `depcheck` جایگزین graph bundle نیست و برای unused dependency طراحی شده است.
2. گزارش شامل `schemaVersion`، entryهای اولیه، فایل‌های payload، اندازه‌ی raw و gzip، importهای static، dynamic chunkهای خارج از بودجه و جمع کل باشد.
3. اگر mapping ماژول در دسترس باشد، هر ماژول به chunk میزبان و سهم rendered bytes آن نگاشت شود؛ اگر یک ماژول در چند chunk تکرار شده، سهم‌ها جداگانه ثبت شوند.
4. خروجی deterministic باشد: ترتیب کلیدها/آرایه‌ها ثابت، بدون timestamp و بدون اطلاعات محیط محلی.
5. نبود manifest، entry یا فایل خروجی باید خطا و exit code غیرصفر ایجاد کند؛ صفر بایت به‌عنوان موفقیت مجاز نیست.
6. گزارش CI به‌عنوان artifact منتشر شود و به repository commit نشود.

**Acceptance criteria M15a:**

- `npm run build` manifest و graph report را تولید می‌کند.
- `npm run budget:bundle` بدون manifest یا graph معتبر fail می‌شود.
- JSON دارای schema version و total gzip payload است و entry/static/dynamic را جدا می‌کند.
- هر فایل گزارش‌شده در payload اولیه روی دیسک وجود دارد و اندازه‌ی آن قابل بازتولید است.
- dynamic importها با برچسب lazy خارج از initial budget باقی می‌مانند.
- اجرای دوباره روی همان commit خروجی deterministic می‌دهد.
- یک regression test عمداً manifest ناقص و یک import static جدید را پوشش می‌دهد.

**فایل‌های مورد نیاز برای تغییر در اجرای M15a:**

- `apps/web/vite.config.ts`: ثبت hook/plugin فقط برای استخراج metadata graph، در صورت نیاز.
- `tools/bundle-budget.ts`: schema گزارش، traversal، validation و اندازه‌گیری.
- `tools/quality/product.phase10.spec.ts` یا spec اختصاصی M15: تست‌های static و failure-path.
- `package.json`: فقط در صورت اضافه‌شدن command مستقل گزارش.
- `docs/DESIGN-V2.md`: اصلاح §14.2/§14.4 برای اشاره به گزارش bundle graph، در صورت نیاز.
- artifactهای CI: فقط در workflow و با `if: always()`؛ فایل report نباید commit شود.

**دستورات test/verify M15a:**

```bash
npm ci --legacy-peer-deps
npm run build
npm run budget:bundle
npm test -- tools/quality/product.phase10.spec.ts
npm run conformance
npm run graph -- --check
```

### M15b: budget enforcement در CI

**هدف:** تبدیل گزارش M15a به policy اجرایی: سقف قرمز در CI الزام‌آور باشد و هر افزایش غیرمجاز یا نبود شواهد build، gate را قرمز کند.

**سیاست پیشنهادی:**

- مقدار hard limit در یک policy مستند و version-controlled نگه‌داری شود؛ مقدار environment فقط برای تست محلی باشد.
- CI همیشه با hard limit اجرا شود و نتواند با override ساده‌ی محیطی آن را دور بزند.
- تجاوز از hard limit باید با total، limit، delta و فهرست بزرگ‌ترین مصرف‌کننده‌ها fail شود.
- تغییر آگاهانه‌ی limit باید همراه با تغییر policy، دلیل، review و evidence CI باشد؛ افزایش خاموش ممنوع است.
- کاهش واقعی حجم باید در گزارش دیده شود و امکان پایین‌آوردن ratchet را فراهم کند، اما خودکار limit را تغییر ندهد.
- report، command، exit code و summary در artifact شواهد CI ذخیره شوند.

**Acceptance criteria M15b:**

- build سالم با payload زیر ۳۰۷٬۲۰۰ B gzip سبز می‌شود.
- fixture یا سناریوی عمدیِ بالاتر از limit با exit code 1 fail می‌شود.
- نبود manifest/report یا خطای اندازه‌گیری نیز fail می‌شود، نه اینکه صفر گزارش شود.
- CI report bundle-budget را در artifact نگه می‌دارد و `gate` آن را قابل ممیزی می‌کند.
- پیام failure شامل limit، مقدار واقعی و مقدار تجاوز است.
- اجرای local با CI policy یکسان است، به‌جز override صریح برای تست failure-path.
- تغییرات M15 فقط مستنداتی نیستند: regression test باید enforcement را نگه دارد و `product.phase10.spec.ts` ادعای بسته‌شدن را پشتیبانی کند.

**فایل‌های مورد نیاز برای تغییر در اجرای M15b:**

- policy فایل جدید، برای مثال `tools/bundle-budget.policy.json` یا معادل مورد تأیید تیم.
- `tools/bundle-budget.ts` یا checker جدا برای policy و ratchet.
- `package.json`: commandهای build/report/check، بدون تغییر dependency مگر با نیاز اثبات‌شده.
- `.github/workflows/ci.yml`: اجرای enforce، upload artifact و اتصال به evidence gate.
- `tools/quality/product.phase10.spec.ts`: تست hard limit، failure-path و bookkeeping M15.
- `docs/WEAKNESSES-V2-10-PHASES.md`: تبدیل M15 به M15a/M15b و ثبت evidence پس از اجرای واقعی.
- در صورت تصمیم معماری جدید، ADR بعدی پس از ADR-0046، بدون بازنویسی ADRهای تاریخی.

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

برای failure-path، limit فقط در محیط تست پایین آورده شود و policy repository تغییر نکند؛ سپس انتظار می‌رود checker با exit code 1 و پیام delta خارج شود.

## ترتیب اجرا و مرز دامنه

1. ابتدا M15a: گزارش معتبر، deterministic و قابل diff.
2. سپس M15b: policy، hard limit و enforcement در CI.
3. بعد از اجرای سبز، شواهد commit/CI در فایل ضعف‌ها ثبت و M15 فقط با evidence تیک بخورد.

خارج از دامنه‌ی این M15: refactor کردن componentها، lazy-loading جدید، حذف dependencyها، تغییر UX و هر اصلاحی که حجم bundle را پایین بیاورد. این‌ها ممکن است نتیجه‌ی M15 باشند، اما شروع M15 نیستند.

## Definition of Done

- گزارش JSON واقعی و قابل بازتولید وجود دارد.
- static و dynamic graph از هم جدا هستند.
- hard limit در CI enforce می‌شود و failure عمدی قرمز است.
- artifact شواهد شامل command، report و exit code است.
- regression test و conformance سبز هستند.
- `docs/WEAKNESSES-V2-10-PHASES.md` به M15a/M15b به‌روزرسانی شده و فقط پس از شواهد، وضعیت بسته‌شدن ثبت می‌شود.

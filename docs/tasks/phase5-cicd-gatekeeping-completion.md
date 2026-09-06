# گزارش تکمیل فاز ۵ - CI/CD، تست و گیت‌کیپینگ واقعی

- شاخه: `feat/phase5-cicd-gatekeeping`
- تاریخ: 2026-09-06
- مرجع تصمیم‌ها: ADR-0037
- مرجع ضعف‌ها: `docs/WEAKNESSES-V2-10-PHASES.md` فاز ۵

## هدف خروج فاز

هیچ گیت سبزی ادعای چیزی را نکند که اجرا نشده است.

## چه چیزی عوض شد

### ۱. شواهد اجرا به جای ادعا (L1/W23)

- `tools/ci/run-gate.sh`: هر گیت با دستور، خروجی کامل و `exit=<code>` در
  `ci-evidence/<gate>.log` ضبط می‌شود؛ کد خروج واقعی همیشه منتقل می‌شود.
- `tools/ci/gate-report.ts` + job پایانی `gate`: فقط وقتی PASS می‌دهد که برای هر
  ۲۰ گیت لازم، لاگ با دستور و `exit=0` موجود باشد. لاگ گم‌شده = بیلد قرمز.
- تست تطابق (parity) بین `REQUIRED_GATES` و `ci.yml` مانع حذف خاموش یک گیت می‌شود.

### ۲. نام job‌ها و پوشش واقعی (H14/R7)

- job‌ها: `lockfile`, `verify`, `security`, `e2e-smoke`, `deployment`, `gate`.
- typecheck/build همه workspace‌ها از مسیر turbo (تست می‌کند که اسکریپت ریشه
  فقط app-web نباشد).

### ۳. پوشش تست (H14)

- `include` کاوریج: علاوه بر پکیج‌های منطقی، `apps/api/src/**` و مسیرهای
  حساس وب (`api`, `context`, `offline`).
- استانه جداگانه برای هر ناحیه: ۷۰٪ پکیج‌ها، ۴۰٪ API و وب به عنوان ratchet.
- گزارش `json-summary` + `lcov` به عنوان artifact با نگهداشت ۱۴ روز.

### ۴. تست مرورگر واقعاً اجراشدنی (H15)

- `apps/api/src/main.ts` پورت را از `PORT` می‌خواند (پیش‌فرض ۳۰۰۰ دست‌نخورده).
- `playwright.config.ts` همه URL و پورت‌ها را از `API_PORT`/`WEB_PORT` می‌سازد؛
  خروجی‌ها: list + html + junit، trace/video/screenshot روی شکست.
- `e2e/helpers/session.ts`: ورود از مسیر واقعی `/login` با `data-testid` پایدار.
  پیش‌تر همه اسپک‌ها به `/` (لندینگ) می‌رفتند و لیبل فارسی‌ای را می‌جستند که
  فرم ورود هرگز نداشت - یعنی عملاً غیرقابل اجرا بودند.
- `LoginPage`/`PatientsPage`: شناسه‌های `login-*` و `patient-*` اضافه شد.
- `@smoke` در هر PR؛ مجموعه کامل (`@offline`, `@analysis`, `@upload-big`, `@perf`)
  در `nightly.yml` با artifact ۳۰ روزه.

### ۵. زنجیره تامین و امنیت (H14/H16/M17)

- `npm ci --legacy-peer-deps` بدون fallback + `tools/ci/lockfile-review.sh`
  (لاک‌فایل بیگانه، تغییر package.json بدون لاک‌فایل، resolved خارج از رجیستری npm).
- `npm audit --audit-level=high --omit=dev`.
- `tools/secret-scan.ts` روی همه فایل‌های tracked (json/yaml/ops/root هم).
- CodeQL (`javascript-typescript`) با یک شرط صریح برای مخازن خصوصی بدون GHAS.
- Dependabot: npm + github-actions + docker (api/web).
- `tools/ci/image-scan.sh`: Trivy روی همان ایمیجی که compose ساخته؛ گزارش
  HIGH+CRITICAL و رد شدن روی CRITICAL قابل رفع.

### ۶. قواعد جدید conformance (M14)

- `package-call-site`: پکیج بدون call-site (import یا dependency واقعی).
- `production-mocks`: `SAMPLE_`/`MOCK_`/`Mocked` روی مسیر production بدون گیت محیطی.
- `package-manager`: هر فراخوانی pnpm/yarn روی سطوح اجراشدنی.
- هر سه قاعده self-test دارند (`tools/conformance/v2.selftest.spec.ts`) و موارد
  قدیمی شناسایی‌شده در `exceptions.json` با ADR-0037 ثبت شدند (بدهی فاز ۱۰:
  M1 داشبورد/اورلی، M2 لایسنس، M4/M16 پکیج‌های scaffold) نه مخفی.

### ۷. باجت باندل از منیفست واقعی (M15)

- `apps/web/vite.config.ts` منیفست تولید می‌کند؛ `tools/bundle-budget.ts` گراف import
  ایستا را از هر entry پیمایش می‌کند؛ `dynamicImports` خارج از محاسبه است.
- نبود منیفست = شکست گیت (قبلاً می‌توانست سهواً صفر بایت گزارش شود).

### ۸. بهداشت پایپ‌لاین

- `concurrency` با `cancel-in-progress` برای CI و nightly.
- روی همه artifact‌ها `retention-days` صریح (۷ تا ۳۰ روز بر اساس نوع).

## شواهد

- تست رگرسیون: `tools/ci/pipeline.phase5.spec.ts` (parity گیت‌ها، رفتار اودیت‌کننده
  شواهد، استانه‌های کاوریج، وایرینگ audit/secret-scan، CodeQL/Dependabot،
  اسکن ایمیج، PORT، سلکتورهای e2e، محاسبه payload اولیه، نگهداشت artifact).
- تست self قواعد: `tools/conformance/v2.selftest.spec.ts`.
- اجرای واقعی: هر ۲۰ گیت در CI همین PR، با لاگ قابل دانلود در artifact
  `evidence-bundle` و جدول خلاصه در job پایانی `gate`.

## مرزهای صریح (در فاز ۵ بسته نشد)

- اسنیپت‌های `pnpm` در `docs/playbooks/*` و آرشیو `docs/tasks|gates`: متن تاریخی،
  متعلق به آیتم drift اسناد در فاز ۱۰ (ADR-0036 و قاعده جدید فقط سطوح
  اجراشدنی را پوشش می‌دهد).
- جداسازی داده SAMPLE داشبورد، واقعی شدن لایسنس و تعیین تکلیف پکیج‌های
  scaffold: فاز ۱۰ (M1/M2/M4/M16) - الان به عنوان استثنای ADRدار ثبت شده‌اند.

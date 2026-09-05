# ScalpAI v2: نقشه راه ۱۰ فازه رفع ضعف‌ها

> وضعیت: **ممیزی انجام شد، هیچ‌یک از فازهای اصلاحی هنوز تکمیل و تیک نخورده‌اند.**
> این فایل مرجع اجرایی ضعف‌هاست. هر مورد تا وقتی کد اصلاحی، تست رگرسیون و اجرای سبز گیت مربوطه ثبت نشده، باز می‌ماند.
> تاریخ ممیزی: 2026-09-06 · مخزن: `parssystem1-coder/scalpai`

## حکم ممیزی

گزارش عمیق قبلی از نظر جهت‌گیری و بیشتر جزئیات **درست است**. سه اصلاح مهم نسبت به متن قبلی:

1. `ops/backup.sh` همین حالا `-pbkdf2` دارد؛ مشکل واقعی آن CBC بدون احراز اصالت، عبور passphrase با `pass:`، fallback عمومی، نبود backup برای MinIO و نبود restore test/off-site replication است.
2. مشکل جست‌وجوی بیمار واقعی است: کنترلر `q` را پاس می‌دهد، اما repo فیلد `search` می‌خواند؛ بنابراین search عملاً خاموش است.
3. mock storage فقط با حذف `..` امن نشده؛ blacklist مسیر قابل اتکا نیست و endpoint خام Fastify بدون احراز هویت، محدودیت حجم و allowlist محیطی همچنان ریسک بحرانی دارد.

## قواعد وضعیت

- `[ ]` باز
- `[~]` در جریان، فقط همراه لینک PR/کامیت
- `[x]` بسته، فقط همراه تست و شواهد CI
- هیچ تیک موجود در `docs/WEAKNESSES.md` یا `docs/PROGRESS.md` به‌تنهایی شواهد بسته‌شدن نیست.

---

# فاز ۱: قطع نشت امنیتی و احراز هویت واقعی

**هدف خروج:** هیچ مسیر unauthenticated برای نوشتن/خواندن فایل یا جعل هویت وجود نداشته باشد.

- [ ] **C1/R1** mock-s3 را از مسیر production حذف یا فقط پشت `STORAGE_DRIVER=mock` در dev/test فعال کن؛ GET/PUT خام باید auth، allowlist، سقف حجم و audit داشته باشند.
- [ ] **C1** مسیر فایل را با `path.resolve` و بررسی containment نسبت به `localStorageDir` ببند؛ blacklist `replace(/\.\./g, "")` کافی نیست.
- [ ] **C1/R1** parser عمومی `*`، `inMemoryMap` بدون سقف و fallback محلی را محدود کن؛ برای body size، تعداد درخواست و حافظه سقف بگذار.
- [ ] **C3** fallback کاربر demo در `AuthContext` و `useAuth` حذف شود؛ `isAuthenticated` فقط از session/token معتبر بیاید.
- [ ] **C3** LoginPage نباید identity سرور را دور بریزد؛ role/clinic/user فقط از پاسخ API بیاید، نه `activeRole`, `clinic-a` یا مقدار `tricho`.
- [ ] **C3** credentialهای پیش‌فرض `owner@clinic-a.test` و `Dev12345!` فقط در dev/test و با guard build قابل استفاده باشند.
- [ ] **C6/R2** fallback `JWT_SECRET` حذف شود؛ نبود secret یا secret ضعیف باید در boot fail کند. نام env در کد و `ops/prod.yml` یکسان شود.
- [ ] **R12** JWT با `iss`, `aud`, `kid`/rotation policy و validation صریح verify شود؛ revoke شدن کاربر/تغییر رمز در اعتبارسنجی لحاظ شود.
- [ ] **R12** login با verify ساختگی برای کاربر ناشناخته، normalize ایمیل و تست timing برابر سخت شود.
- [ ] **R12** `/auth/refresh`, `/auth/logout` و endpointهای حساس rate-limit مستقل داشته باشند.
- [ ] **H1** refresh token از localStorage خارج و به HttpOnly/Secure/SameSite cookie منتقل شود؛ logout باید خانواده توکن را در سرور revoke کند.
- [ ] **C7/R2** CORS در production فقط allowlist صریح env باشد؛ wildcardهای `*.vercel.app`/`*.run.app` و شرط `NODE_ENV !== production` حذف شوند.
- [ ] **R12** Swagger در production auth یا allowlist داشته باشد.
- [ ] **C1,C3,C6,C7,H1,R12** تست منفی end-to-end برای جعل JWT، origin غیرمجاز، mock-s3، refresh reuse و logout اضافه شود.

**شرط تکمیل فاز:** تست امنیتی سبز + secret scan سبز + بررسی دستی endpointهای public.

---

# فاز ۲: قفل تنانسی، RLS و مرز دسترسی

**هدف خروج:** هیچ tenant از tenant دیگر یا از platform catalog عبور نکند.

- [ ] **C5** برای `clinics` و `refresh_tokens` تصمیم صریح بگیر: RLS/policy واقعی یا service role محدود و مستند با ADR؛ دسترسی کامل app role ممنوع.
- [ ] **C5/M14** `EXEMPT_TABLES` هاردکد حذف شود؛ همه استثناها فقط از `exceptions.json` با ADR معتبر خوانده شوند.
- [ ] **C5/M14** `RLS_TABLES` از SQL/migration استخراج شود؛ جدول جدید نباید با اضافه‌نشدن دستی از گیت جا بماند.
- [ ] **C4** catalog پلن از tenant API خارج و به `platform_admin`/migration/CLI محدود شود؛ owner کلینیک نباید plan/features مشترک را تغییر دهد.
- [ ] **C4** `limits` با schema عدد صحیح و `min(0)`، سقف منطقی و تست overflow اعتبارسنجی شود.
- [ ] **R5** مسیرهای auth که خارج از tenant RLS هستند role و query محدود اختصاصی داشته باشند و در ADR ثبت شوند.
- [ ] **R3** `AsyncLocalStorage.enterWith` با middleware/مرز درخواست مبتنی بر `als.run(ctx, next)` جایگزین شود؛ تست concurrent cross-tenant اضافه شود.
- [ ] **M12** repoهایی که فقط به RLS تکیه دارند، predicate صریح `clinic_id` هم داشته باشند یا استثنای ADRدار داشته باشند.
- [ ] **C5/M12** unique constraint ایمیل با مدل هویت تصمیم‌گیری شود؛ اگر ایمیل در هر کلینیک مستقل است، global uniqueness اصلاح و تست شود.
- [ ] **C5** policyهای SELECT/INSERT/UPDATE/DELETE برای clinics, refresh_tokens, plans و plan_features با matrix نقش‌ها تست شوند.
- [ ] **H18** `resetAll` از API عمومی خارج و به entrypoint testing منتقل شود؛ در production یا DB غیر test/dev باید fail کند.
- [ ] **M14** ruleهای feature-gate برای GETهای PHI، controllerهای جدید، `.tsx`، `ops/` و فایل‌های JSON/YAML پوشش کامل داشته باشند.

**شرط تکمیل فاز:** تست cross-tenant برای هر جدول clinic-scoped + اجرای conformance بدون exemption پنهان.

---

# فاز ۳: نشست، توکن و Auth transaction integrity

**هدف خروج:** refresh rotation، revoke و claims در برابر race و replay اتمیک باشند.

- [ ] **R4** `rotate()` را در یک transaction واحد اجرا کن؛ ردیف parent با `SELECT ... FOR UPDATE` قفل شود، child ساخته و parent همان‌جا replaced شود.
- [ ] **R4/H1** دو refresh همزمان با یک token باید دقیقاً یک موفقیت و یک reuse/revoke نتیجه بدهد.
- [ ] **R5** lookupهای login/refresh با least privilege و حداقل داده انجام شوند؛ clinic claim از DB بیاید، نه token ورودی.
- [ ] **R12** revoked user، expired family، replaced parent و mismatch clinic در یک matrix کامل تست شوند.
- [ ] **R11/M6** throttle و entitlement cache از Map درون‌پردازه به Redis با TTL، eviction و namespace tenant منتقل شوند.
- [ ] **R11** نام env پنجره IP یکسان شود: مستندات و کد نباید `AUTH_IP_WINDOW_MS`/`IP_WINDOW_MS` متفاوت بخوانند.
- [ ] **L4** rate-limit سراسری برای sync push، upload، analysis و endpointهای پرهزینه با quota tenant اضافه شود.
- [ ] **R12** secret rotation بدون deploy هم‌زمان طراحی شود؛ key id و invalidation policy مستند شود.

**شرط تکمیل فاز:** تست race با حداقل ۲۰ refresh همزمان، تست چند replica با Redis و گزارش عدم replay.

---

# فاز ۴: زیرساخت self-hosted و استقرار امن

**هدف خروج:** `ops/prod.yml` واقعاً بالا بیاید، migrate شود و TLS/secretهای امن داشته باشد.

- [ ] **C8/R10** یک مدل استقرار رسمی انتخاب کن: پیشنهاد، web روی Vercel و API/worker روی Docker+Caddy؛ پروژه Vercel API ناسازگار حذف یا اصلاح شود.
- [ ] **C8** `DATABASE_URL` در production با `scalpai_app` و secret صحیح تنظیم شود؛ role owner برای runtime ممنوع.
- [ ] **C8** سرویس migration مستقل با اجرای یک‌باره و dependency صحیح اضافه شود؛ app قبل از migration بالا نیاید.
- [ ] **C8** worker واقعی بساز یا worker service را حذف کن؛ `dist/worker.js` فعلی وجود ندارد.
- [ ] **C8** Dockerfile از `npm run build --filter` استفاده نکند؛ build واقعی با `npm exec turbo run build --filter=...` یا script رسمی انجام شود.
- [ ] **C8** `npm install --ignore-scripts` حذف/جایگزین شود؛ native moduleهای `sharp` و Argon2 باید واقعاً build/install شوند.
- [ ] **C8/H16** lockfile در Docker و CI با `npm ci` اجباری شود؛ fallback به `npm install` حذف شود.
- [ ] **C8** fallback passwordهای `scalpai_secure_pwd` و کلیدهای عمومی از compose حذف؛ نبود secret باید fail شود.
- [ ] **C8/R10** Caddy با domain واقعی، ACME روشن و redirect HTTP به HTTPS اجرا شود؛ `auto_https off` و `:80` حذف شوند.
- [ ] **M17** Postgres version بین CI و ops یکسان و imageهای MinIO/Redis/Caddy pin شوند.
- [ ] **M17** `.dockerignore`، healthcheck API/web، resource limits و graceful shutdown اضافه شود.
- [ ] **H15** تمام `pnpm`های Playwright، Husky، docs و graph با npm repository یکسان شوند.
- [ ] **H14/R7/R9** root scripts واقعاً همه workspaceها را با Turbo build/typecheck کنند، نه فقط app-web.

**شرط تکمیل فاز:** اجرای clean از صفر با `docker compose`, migration، healthcheck، TLS و build بدون دست‌کاری دستی.

---

# فاز ۵: CI/CD، تست و گیت‌کیپینگ واقعی

**هدف خروج:** هیچ گیت سبزی ادعای چیزی را نکند که اجرا نشده است.

- [ ] **H14/R7** typecheck و build همه apps/packages اجرا شود؛ اسم jobها با کار واقعی منطبق شود.
- [ ] **H14** coverage برای API و مسیرهای مهم web اضافه شود؛ ۷۰٪ پکیج‌ها به‌تنهایی کافی نیست.
- [ ] **H15** Playwright با npm و URL/port واقعی اجرا شود؛ `main.ts` پورت را از `process.env.PORT` بخواند.
- [ ] **H15** تست‌ها با `/login` و `data-testid` پایدار اصلاح شوند؛ smoke/offline/analysis/upload/perf واقعاً run شوند.
- [ ] **H15** حداقل e2e smoke در CI و تست کامل nightly اجرا شود؛ حذف e2e از gate باید موقت و صریح باشد.
- [ ] **H16** `npm ci` بدون fallback و lockfile review اجباری شود.
- [ ] **H14** `npm audit --audit-level=high`، CodeQL، Dependabot و secret scanning به CI اضافه شوند.
- [ ] **M17** Docker build و image scan در CI اجرا شود.
- [ ] **L1/W23** گیت‌ها self-certified نباشند؛ هر PASS باید log دستورهای conformance, test, build, e2e را داشته باشد.
- [ ] **M14** ruleهای جدید اضافه شوند: package بدون call-site، `SAMPLE_/MOCK_/Mocked` در production، و pnpm در repo npm.
- [ ] **M15** bundle budget از manifest واقعی Vite و graph importهای static محاسبه شود.
- [ ] CI concurrency cancellation و artifact retention برای trace/coverage/log اضافه شود.

**شرط تکمیل فاز:** یک PR عمداً خراب باید هر گیت مربوط را قرمز کند و یک PR سالم همه گیت‌ها را سبز کند.

---

# فاز ۶: داده بالینی، رمزنگاری و حریم خصوصی

**هدف خروج:** PHI در rest، transit، log، ledger و storage مسیر کنترل‌شده داشته باشد.

- [ ] **C2** `notes_encrypted` واقعاً با AES-256-GCM/pgcrypto رمز شود؛ key از secret manager بیاید و rotation policy داشته باشد.
- [ ] **C2/H3** یادداشت خام از mutation ledger و Dexie خارج شود؛ فقط ciphertext یا field names/delta مجاز ذخیره شود.
- [ ] **H17** canonical JSON برای audit meta تعریف شود؛ ترتیب کلیدها و دقت timestamp باید deterministic باشد.
- [ ] **H17** `verifyAuditChainIntegrity` واقعاً row hash را recompute کند؛ ادعای Merkle فقط با tree و inclusion proof مجاز باشد.
- [ ] **H17** anchor در جدول و مقصد بیرونی WORM/فایل امضاشده ذخیره و verify شود.
- [ ] **M8** signature payload محدودیت حجم، MIME و schema داشته باشد؛ IP و user-agent ثبت شوند.
- [ ] **M8** امضا در MinIO با hash نگه‌داری شود، نه data URL حجیم در DB؛ template نسخه‌دار و revoke flow اضافه شود.
- [ ] **M9** گزارش/PDF فقط وقتی «اصالت» بنویسد که hash، امضای Ed25519 و QR verify داشته باشد؛ وگرنه label حذف شود.
- [ ] **M21** retention و purge بیمار برای DB، تصاویر، analysis و ledger با audit و approval طراحی شود.
- [ ] **M22** orphan object queue و reconciliation بین DB و bucket اضافه شود؛ شکست delete نباید silent باشد.
- [ ] لاگ‌ها requestId و metadata محدود داشته باشند؛ PHI/password/token هرگز log نشود.

**شرط تکمیل فاز:** threat model PHI، تست رمزگشایی/rotation، تست tamper audit و گزارش retention.

---

# فاز ۷: sync چنددستگاهی و offline correctness

**هدف خروج:** push/pull، retry، dedupe و conflict resolution داده را از دست ندهند.

- [ ] **H2** کلاینت `sync/pull` را با cursor پایدار، mount، online event و polling/backoff پیاده کند.
- [ ] **H3** mutation ledger فقط applied و delta واقعی فیلترشده را ثبت کند؛ payload ردشده پخش نشود.
- [ ] **H4** هر mutation با SAVEPOINT یا transaction مستقل isolate شود؛ خطای یک آیتم کل batch را rollback نکند.
- [ ] **H4** unique index به `(clinic_id, client_mutation_id)` اصلاح و dedupe cross-tenant تست شود.
- [ ] **H5** cursor بر مبنای commit-safe ordering طراحی شود؛ sequence قبل از commit نباید باعث skip شود.
- [ ] **H6** baseVersion الزامی و schema version محدود به نسخه موجود شود؛ clock skew فقط metadata باشد.
- [ ] **H6** LWW به version/counter سروری متکی شود، نه clock کلاینت؛ conflict test چند دستگاه اضافه شود.
- [ ] **C9** Dexie از `clear()+bulkAdd` جداگانه به transaction اتمیک/put تکی منتقل شود.
- [ ] **C9** rejectedها dead-letter، retry count، backoff و maxRounds داشته باشند؛ while نامحدود حذف شود.
- [ ] **H8** DB آفلاین per clinic/user باشد و logout آن را پاک یا invalidate کند.
- [ ] **M6** sync با token کاربر فعلی و clinic queue تطبیق دهد.

**شرط تکمیل فاز:** تست دو دستگاه، قطع برق/تب، conflict، rejected mutation، duplicate mutation و cursor pagination.

---

# فاز ۸: مدیا، آپلود و سهمیه

**هدف خروج:** upload امن، قابل ادامه، bounded و tenant-scoped باشد.

- [ ] **H7** resume واقعاً S3 multipart upload قبلی را ادامه دهد؛ `uploadId` حفظ و `ListParts` استفاده شود.
- [ ] **H7** state به جدول Dexie `pendingUploads` منتقل شود؛ localStorage مرجع اصلی نباشد.
- [ ] **H7/H12** presigned URLها lazy/part-based صادر شوند؛ URLهای منقضی‌شده و totalParts غیرمعتبر مدیریت شوند.
- [ ] **H12** bodyهای multipart با Zod، حداقل/حداکثر part، size و تعداد parts اعتبارسنجی شوند.
- [ ] **H12** قبل از `getObject` با `HeadObject` اندازه واقعی check شود؛ sharp با stream و concurrency محدود اجرا شود.
- [ ] **H11** quotaهای analyses، storage bytes و uploads اضافه و check+increment در یک transaction قفل‌شده انجام شود.
- [ ] **H11** period quota با timezone کلینیک محاسبه شود، نه UTC ثابت.
- [ ] **C1/M22** storage key فقط clinic-scoped و allowlist‌شده باشد؛ direct media proxy بدون auth/tenancy ممنوع.
- [ ] **M22** usage واقعی bucket اندازه‌گیری و object lifecycle/retention تنظیم شود.
- [ ] rate limit و concurrency limit برای upload/thumbnail/analysis اضافه شود تا OOM ممکن نباشد.

**شرط تکمیل فاز:** تست فایل بزرگ، upload قطع‌شده، resume واقعی، فایل خراب، oversize، quota race و object isolation.

---

# فاز ۹: بکاپ، بازیابی و عملیات قابل اعتماد

**هدف خروج:** از دست‌رفتن DB یا تصاویر به از دست‌رفتن پرونده تبدیل نشود.

- [ ] **C10** backup شامل PostgreSQL و MinIO باشد؛ `pg_dump` به‌تنهایی کافی نیست.
- [ ] **C10** CBC به ابزار authenticated encryption مثل age یا GPG/AES-GCM منتقل شود؛ اگر CBC موقتاً ماند، HMAC مستقل اضافه شود.
- [ ] **C10** passphrase از `pass:` و env عمومی خارج و از mounted secret/file descriptor خوانده شود.
- [ ] **C10** fallback passphrase حذف و backup بدون secret fail شود.
- [ ] **C10** backup off-site، immutable/WORM و با retention مستند نگه‌داری شود.
- [ ] **C10** restore خودکار ماهانه در staging با checksum و smoke query اجرا شود.
- [ ] **L3** requestId، structured logs، metrics، health/readiness و alerting اضافه شود؛ PHI scrub اجباری باشد.
- [ ] **L4** rate limit سراسری و per-clinic برای endpointهای پرهزینه operationalize شود.
- [ ] pool DB دارای `statement_timeout`, `idle_in_transaction_session_timeout` و limit مناسب باشد.
- [ ] runbook برای incident، key rotation، restore، tenant isolation و data deletion نوشته شود.
- [ ] صحت backup و restore به CI/nightly gate متصل شود، نه فقط به cron log.

**شرط تکمیل فاز:** restore موفق از backup واقعی شامل عکس، با زمان بازیابی اندازه‌گیری‌شده و گزارش امضاشده.

---

# فاز ۱۰: کیفیت محصول، مستندات و حذف بدهی فنی

**هدف خروج:** ادعاهای محصول، معماری و UX با واقعیت کد یکی باشند.

- [ ] **H10** پارامتر `q/search` یکسان و تست regression برای search واقعی اضافه شود؛ trigram index واقعاً استفاده شود.
- [ ] **H13** تحلیل client را با image hash، model manifest/version، signature یا server verification قابل اثبات کن؛ label «کمکی و غیرتشخیصی» اجباری.
- [ ] **M1** SAMPLE data از provider واقعی جدا، banner/watermark دائمی داشته و در production build حذف شود.
- [ ] **M2** licensing واقعاً به endpoint و verify Ed25519 وصل شود؛ متن «Verified» از mock نیاید.
- [ ] **M3** desktop یا Electron واقعی شود یا ادعای سخت‌افزار از scope و docs حذف شود.
- [ ] **M4/M16** packageهای scaffold/BOM، کدهای unused، duplicate audit-anchor و assetهای بدون reference حذف یا ثبت شوند.
- [ ] **M5** i18n کامل شود؛ hardcoded Persian/English، LTR login و alertهای fake جمع شوند.
- [ ] **M10** signature canvas هنگام resize snapshot/restore داشته باشد.
- [ ] **M11** error filter SPA fallback را non-blocking/cached کند، 404 واقعی را نبلعد و log را scrub کند.
- [ ] **M13** timezone کلینیک در DB/settings استاندارد شود؛ تاریخ آینده در relative time درست نمایش داده شود.
- [ ] **M18** فونت‌ها self-host و تعدادشان کم شود؛ third-party CDN برای self-hosted حذف شود.
- [ ] **M19** ESLint type-aware، react-hooks، jsx-a11y و no-floating-promises اضافه؛ TypeScript strict flags روشن و specها typecheck شوند.
- [ ] **M20** README، LICENSE، SECURITY.md، `.env.example`، CODEOWNERS، PR template و Dependabot اضافه شوند.
- [ ] **M14** conformance روی `.tsx`, `ops`, JSON/YAML و call-siteهای معماری کامل شود.
- [ ] **M15** bundle budget با graph واقعی اصلاح شود.
- [ ] **L2** dashboard بزرگ به component/hookهای کوچک‌تر و یک سیستم style استاندارد شکسته شود.
- [ ] **L1/W01/W22/W23** مستندات drift پاک شود؛ تیک‌های متناقض W01/W06/W07/W12/W23 و PASSهای بدون شواهد اصلاح شوند.
- [ ] **PR #21** به‌دلیل base قدیمی و diff آرایشی rebase/بسته شود؛ **PR #23** چون diff مؤثر ندارد بسته شود.
- [ ] **M7/R13** Firebase/metadata و هر secret/scaffold غیرمصرفی بررسی، حذف یا rotate شود؛ secret scan باید json/yaml/ops/root را هم ببیند.
- [ ] **R14** وابستگی‌ها از root به workspace درست منتقل و `three`, `lucide-react`, coverage tooling و package manager policy مرتب شوند.

**شرط تکمیل فاز:** README از صفر اجرا شود، docs با کد تطبیق داشته باشد، dead-code scan سبز و هیچ claim بدون evidence باقی نماند.

---

## وضعیت فازها

- [x] ممیزی و ادغام یافته‌ها انجام شد.
- [ ] فاز ۱: قطع نشت امنیتی و احراز هویت واقعی
- [ ] فاز ۲: قفل تنانسی، RLS و مرز دسترسی
- [ ] فاز ۳: نشست، توکن و Auth transaction integrity
- [ ] فاز ۴: زیرساخت self-hosted و استقرار امن
- [ ] فاز ۵: CI/CD، تست و گیت‌کیپینگ واقعی
- [ ] فاز ۶: داده بالینی، رمزنگاری و حریم خصوصی
- [ ] فاز ۷: sync چنددستگاهی و offline correctness
- [ ] فاز ۸: مدیا، آپلود و سهمیه
- [ ] فاز ۹: بکاپ، بازیابی و عملیات قابل اعتماد
- [ ] فاز ۱۰: کیفیت محصول، مستندات و حذف بدهی فنی

## روش بستن هر فاز

برای هر فاز فقط این چهار مدرک کافی است: **PR/commit اصلاحی، تست regression، خروجی CI/conformance، و گزارش کوتاه completion**. بعد از آن checkbox همان فاز و فقط موارد واقعاً بسته‌شده تیک می‌خورند؛ شروع بعدی همیشه از اولین `[ ]` باقی‌مانده خواهد بود.

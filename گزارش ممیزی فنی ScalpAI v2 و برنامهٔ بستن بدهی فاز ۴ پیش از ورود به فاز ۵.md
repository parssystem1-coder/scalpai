# گزارش ممیزی فنی ScalpAI v2 و برنامهٔ بستن بدهی فاز ۴ پیش از ورود به فاز ۵

**تاریخ ممیزی:** ۱۳ سپتامبر ۲۰۲۶  
**نسخهٔ بررسی‌شده:** `2650ef91d2bca315c5eb38cd522ad8b65c80f463` روی شاخهٔ `main`  
**دامنه:** معماری، مسیرهای بالینی وب، امنیت و حریم داده، آزمون و کیفیت، عملیات و استقرار، و آمادگی محصول برای «فاز ۵: رشد تجاری».

> **حکم اجرایی: ورود مستقیم به فاز ۵ توصیه نمی‌شود.** زیرساخت پایه، جداسازی tenant، CI و کنترل‌های تحلیلی پروژه بالغ‌تر از یک نمونهٔ اولیه هستند؛ با این حال، چند بدهی «مسدودکننده» در مسیر اصلی dashboard، اعتبار خروجی بالینی، کنترل انتشار و حفاظت داده وجود دارد. این موارد باید در یک برنامهٔ نهایی و محدودِ بستن فاز ۴ رفع و با شواهد مستقل تأیید شوند. شروع Aftercare، پیام‌رسانی، پرداخت یا پرتال بیمار پیش از آن، دامنهٔ ریسک و هزینهٔ اصلاح را چند برابر می‌کند.

## ۱. جمع‌بندی مدیریتی

ScalpAI از نظر **هستهٔ پلتفرم** وضعیت خوبی دارد. معماری monorepo، قراردادهای مشترک، محدودسازی مرز import، TypeScript سخت‌گیرانه، RLS پایگاه‌داده، refresh-token چرخشی، audit log، encryption یادداشت بالینی، گیت‌های CI، backup/restore و بودجهٔ bundle در کد و مستندات قابل مشاهده‌اند. این نقاط قوت نشان می‌دهد پروژه ظرفیت تبدیل‌شدن به یک محصول قابل اتکا را دارد.

اما **رابط dashboard که کاربر پس از login می‌بیند** در چند عمل حساس از مسیر کانُنیکال API/Repository/Outbox جدا شده است. بیمار، تصویر و تحلیل در آن در مواردی به state محلی یا دادهٔ مصنوعی وابسته‌اند، ولی با زبان یک گردش‌کار بالینی نمایش داده می‌شوند. این خطر از بدهی عادی UI فراتر می‌رود: کاربر ممکن است تصور کند داده ثبت، تحلیل یا امضا شده است، در حالی که persistence، provenance، بازبینی متخصص یا صدور server-side قابل اثبات نیست.

از سوی دیگر، گیت‌های فنی در مخزن وجود دارند اما **اجبار پلتفرمی آن‌ها روی `main` مشاهده نشد**. همچنین مسیر انتشار immutable، کنترل کامل وابستگی‌های runtime، اجرای local test از clone تمیز، و چند کنترل امنیتی/عملیاتی هنوز نیاز به تکمیل دارند. بنابراین توصیهٔ این گزارش یک «Phase 4.5» نیست؛ بلکه **بستن واقعی فاز ۴ در پنج موج محدود، قابل آزمایش و دارای gate خروج** است.

| حوزه | ارزیابی | نتیجهٔ تصمیم |
|---|---|---|
| هستهٔ backend، tenant isolation و قراردادها | قوی | حفظ و توسعه روی همین پایه |
| CI، static checks و build | خوب، اما قابل دورزدن و با شکاف coverage | سخت‌سازی لازم پیش از توسعهٔ جدید |
| dashboard و workflow بالینی اصلی | پرریسک | مسدودکنندهٔ ورود به فاز ۵ |
| امنیت دادهٔ آفلاین و encryption-at-rest | کنترل‌های مهم دارد، اما proof/coverage ناقص است | رفع در فاز ۴ لازم است |
| عملیات، release و rollback | topology خوب، مسیر release ناقص | مسدودکننده یا remediation پیش از فاز ۵ |
| قابلیت استفاده، a11y، i18n و PWA | زیرساخت خوب، چند مسیر critical ناقص | رفع بخش‌های حساس در فاز ۴ |

## ۲. شواهد اجرایی ممیزی

آزمون‌ها روی clone تمیز و بدون تغییر کد اجرا شدند. `typecheck` برای ۱۹ هدف، `lint`، `conformance` و secret scan موفق بودند. conformance هیچ violation فعال نداشت و ۱۱ exception مستند با ADR گزارش کرد. build همهٔ ۱۲ workspace موفق بود. payload اولیهٔ وب **241,290 بایت gzip** در برابر سقف **307,200 بایت gzip** بود؛ بنابراین 65,910 بایت headroom باقی مانده است. با این حال، Rollup برای chunkهای بزرگ هشدار داد؛ این مورد فعلاً blocker نیست زیرا `three-vendor` و dashboard lazy-load هستند، اما باید در گیت عملکرد فاز ۵ پایش شود.

اجرای مستقیم `npm test` در sandbox کاملاً سبز نشد: ۷۰ test file و ۶۲۵ test عبور کردند، اما ۱۲ suite API پیش از اجرای testها به‌دلیل نبود `JWT_SECRET` و PostgreSQL محلی متوقف شدند. این **نشانهٔ شکست منطقی CI نیست**؛ workflow CI محیط و سرویس‌های لازم را فراهم می‌کند. با این وجود، برای توسعه‌دهندهٔ جدید و ممیزی مستقل، فرمان قراردادی `npm test` در clone تمیز بازتولیدپذیر نیست و باید به‌عنوان بدهی کیفیت رفع شود. [1] [2]

`npm audit --omit=dev` نیز دو advisory با شدت Moderate در زنجیرهٔ runtime Fastify گزارش کرد. اسکریپت فعلی فقط یافته‌های High و Critical را fail می‌کند؛ بنابراین اجرای audit exit صفر داشت. پذیرش این وضعیت در API دارای PHI توصیه نمی‌شود و باید یا با upgrade سازگار رفع شود یا risk acceptance زمان‌دار و دارای owner داشته باشد. [1]

## ۳. نقاط قوت قابل حفظ

### ۳.۱ معماری و کنترل مرزها

پروژه از monorepo با packageهای مشخص برای قراردادها، دیتابیس، sync، licensing و analysis استفاده می‌کند. قواعد conformance مانع importهای نامعتبر بین workspaceها، ورود `packages/db` به bundle مرورگر و وابستگی‌های معماری بدون call-site می‌شوند. TypeScript با `strict` و چند گزینهٔ ایمنی مهم فعال است و ESLint type-aware برای production code برقرار است. این سرمایه برای قابلیت‌های فاز ۵ باید حفظ شود، نه با یک integration مستقیم به providerهای پیام‌رسان دور زده شود. [3] [4]

### ۳.۲ امنیت پایه و tenant isolation

مدل امنیتی backend دارای عناصر ارزشمند است: `JwtAccessGuard` سراسری، بازبینی principal از پایگاه‌داده، tenant context درخواست‌محور، RLS، runtime role محدود، audit hash-chain، refresh token چرخشی و encryption یادداشت بالینی با AES-256-GCM و key ring. مسیر upload نیز کلید tenant-scoped، URL کوتاه‌عمر، magic-byte validation، پردازش مجدد تصویر و EXIF stripping دارد. این‌ها مبنای مناسبی برای ورود به قابلیت‌های تجاری هستند. [5] [6]

### ۳.۳ ابزارهای کیفیت و بازیابی

CI شامل migration از دیتابیس خالی، coverage، build، budget، conformance، secret scan، audit، smoke E2E، backup و restore drill است و برای فرمان‌های گیت evidence نگه می‌دارد. توپولوژی self-hosted نیز مهاجرت one-shot، resource limits، healthcheck، Caddy و backup رمزگذاری‌شده را تعریف کرده است. در نتیجه، هدف اصلاح باید **اتصال این توانایی‌ها به مسیر release واقعی و مسیر واقعی کاربر** باشد، نه بازنویسی کامل زیرساخت. [7] [8]

### ۳.۴ توجه به زبان و عملکرد

i18n فارسی/انگلیسی، RTL، digit shaping و تاریخ جلالی به‌صورت متمرکز وجود دارند. Route splitting و budget bundle قابل اجرا هستند و مدل 3D lazy-load می‌شود. این‌ها پایهٔ مناسبی برای product polish فاز ۵ هستند، به شرط آن‌که hardcodeهای باقی‌مانده، reduced motion و مسیرهای دسترس‌پذیری برطرف شوند. [9] [10]

## ۴. یافته‌های اولویت‌دار و راهکار حرفه‌ای

### ۴.۱ مسدودکننده‌های فاز ۴

| ID | شدت | یافته | اثر | اقدام لازم پیش از فاز ۵ |
|---|---|---|---|---|
| P4-B01 | بحرانی | dashboard مسیر login برای ایجاد بیمار، upload و حذف عکس به state محلی و شناسه/دادهٔ مصنوعی متکی است | ثبت ظاهری بدون persistence، sync یا audit؛ از دست‌رفتن داده پس از refresh یا تعویض دستگاه | dashboard را API-first کنید یا تا تکمیل، آن را صریحاً demo/read-only و خارج از مسیر login قرار دهید |
| P4-B02 | بحرانی | تحلیل، capture و PDF در dashboard مقادیر synthetic/random یا برچسب‌های Verified/Signed/تجویزیِ غیرقابل اثبات دارند | خطر تصمیم، چاپ یا ارتباط بالینی گمراه‌کننده | حذف/قفل هر ادعای clinical تا اتصال کامل provenance، clinician review و artifact server-side |
| P4-B03 | بحرانی | branch protection برای `main` required check اجباری و enforce-admin مشاهده نشده است | امکان ورود کد بدون عبور از CI، امنیت، migration یا release gate | ruleset اجباری با PR، gate report، review، up-to-date branch و منع bypass دائمی |
| P4-B04 | بالا | دو advisory Moderate Fastify در runtime باقی است | ریسک validation/proxy در سطح API PHI | upgrade سازگار Nest/Fastify و audit بدون Moderate/High/Critical، یا acceptance زمان‌دار |
| P4-B05 | بالا | mutationهای patient ممکن است در IndexedDB به‌صورت plaintext باقی بمانند | افشای دادهٔ هویتی در browser profile یا پس از رخداد XSS | policy صریح offline PHI؛ حذف persistence یا encryption envelope با key management واقعی |
| P4-B06 | بالا | مسیر release از source محلی build می‌کند؛ digest promotion و rollback application/schema ندارد | release غیرقابل‌تکرار و rollback پرخطر | یک build immutable، image digest، SBOM/provenance/signing و promotion staging→production |
| P4-B07 | بالا | مستندات وضعیت فاز ۴ متناقض‌اند؛ `PROGRESS` فاز را کامل و roadmap آن را باز می‌داند | تصمیم‌گیری و gate خروج قابل ممیزی نیست | یک source of truth با owner، evidence، commit، test و status واحد |
| P4-B08 | بالا | auto-lock روی dashboard اصلی پس از login وجود ندارد | نمایش طولانی PHI در workstation مشترک | authenticated shell مشترک برای همه routeهای protected و E2E idle-lock |
| P4-B09 | بالا | offline consent با cast به entity نامعتبر enqueue می‌شود؛ PWA service worker مشاهده نشد | رضایت ممکن است ثبت نشود؛ ادعای offline app با واقعیت هم‌راستا نیست | پشتیبانی end-to-end consent در sync یا غیرفعال‌سازی صریح؛ تصمیم روشن درباره PWA |

#### P4-B01 — یکپارچه‌سازی مسیر دادهٔ dashboard

مسیر `/dashboard` پس از login render می‌شود، اما `useDashboardRecords` بیمار جدید را با `Date.now()`، state محلی و event محلی می‌سازد. `useImageUpload` نیز فایل را به Data URL تبدیل کرده و در state محلی می‌گذارد. این در تضاد با مسیر کانُنیکال `PatientsPage` است که از API، mutation و outbox استفاده می‌کند. [11] [12]

**راهکار پیشنهادی:** یک لایهٔ واحد مانند `useClinicalRecords` یا `DashboardPatientRepository` بسازید که فقط از typed API client، query cache و outbox رسمی استفاده کند. dashboard نباید owner متفاوتی برای `patients`، media یا analysis باشد. optimistic UI باید stateهای `draft`، `queued`، `syncing`، `synced` و `failed` داشته باشد و label «ثبت شد» فقط پس از acknowledgement سرور نمایش داده شود.

**معیار پذیرش:** در dashboard، ایجاد بیمار، upload، حذف، refresh و ورود از دستگاه دیگر دادهٔ یکسانی نشان دهد؛ در قطع شبکه یک mutation دقیقاً یک بار به API برسد؛ و هیچ `Date.now` identifier، Data URL یا fake metric در مسیر `real` باقی نماند.

#### P4-B02 — توقف هر claim بالینیِ غیرمتصل به provenance

در dashboard، تحلیل از آرایهٔ ثابت و `Math.random()` استفاده می‌کند؛ capture می‌تواند نمونه را به‌جای frame واقعی ثبت کند؛ و PDF عبارت‌هایی مانند Verified/Signed، prescription و شناسه‌هایی ظاهری دارد، در حالی که صدور آن `window.print()` است. [13] [14]

**راهکار پیشنهادی:** تا تکمیل اتصال سرور، این featureها باید با disclosure دائمی **«محیط آموزشی/شبیه‌سازی؛ غیرقابل استفاده برای تصمیم یا پروندهٔ بالینی»** محدود شوند. مسیر production باید هر نتیجه را به `imageId`، `imageHash`، quality-gate، model/version، timestamp، record ID و clinician review متصل کند. PDF فقط پس از validation سرور، immutable report ID، signature قابل verify و QR verification ساخته شود. اگر هر جزء آماده نیست، واژه‌های «تأیید»، «امضا»، «نسخه» و «گزارش رسمی» باید حذف شوند.

**معیار پذیرش:** هیچ توصیه، metric یا PDF بدون record واقعی و provenance کامل صادر نشود؛ failure تحلیل آشکار باشد و آخرین نتیجهٔ قدیمی را تازه نشان ندهد؛ و test منفی صدور گزارش بدون review را رد کند.

#### P4-B03 — تبدیل CI از «موجود» به «اجباری»

بررسی تنظیمات GitHub نشان داد required checks و ruleset فعال برای `main` خالی‌اند؛ در حالی که خود مخزن برای مسیرهای حساس CI کامل را الزام کرده است. این فاصله میان policy و platform یک شکاف release-critical است. [4]

**راهکار پیشنهادی:** روی `main` یک ruleset اعمال‌شده ایجاد کنید: PR اجباری، منع force push و direct push، required `gate report`، review حداقل یک نفر، conversation resolution، strict branch up-to-date و enforce برای administratorها. برای hotfix، فقط bypass زمان‌دار، نام‌دار و audit‌شونده مجاز باشد.

**معیار پذیرش:** API GitHub ruleset و required check را نشان دهد؛ یک PR آزمایشی بدون گیت سبز قابل merge نباشد؛ و هر bypass به issue/incident و approval مشخص متصل باشد.

#### P4-B05 — تعیین مدل PHI آفلاین و encryption-at-rest قابل اثبات

scope کردن IndexedDB به clinic/user مفید است، اما encryption محسوسی برای payload mutation مشاهده نشد. fixtureها نشان می‌دهند حداقل name و phone می‌توانند وارد envelope شوند. در DB نیز encryption سطح برنامه برای `notes_encrypted` وجود دارد، اما برای identifiers و media، کنترل enforce‌شده در repository مشاهده نشد؛ ممکن است host encryption بیرونی وجود داشته باشد، اما در کد قابل اثبات نیست. [6] [15]

**راهکار پیشنهادی:** نخست policy محصولی تعیین کنید: آیا PHI هویتی و consent اجازهٔ نگهداری offline دارند یا نه؟ اگر پاسخ مثبت است، outbox فقط ciphertext نگه دارد و کلید session/device-bound غیرقابل export با auto-lock/logout/delete lifecycle داشته باشد. کلید نباید کنار ciphertext در IndexedDB یا localStorage ذخیره شود. برای media، SSE-KMS یا معادل آن با bucket policy، rotation و boot/health verification enforce شود. برای identifierها، encryption سطح برنامه همراه blind index/HMAC search یا کنترل زیرساختی قابل سنجش انتخاب شود.

**معیار پذیرش:** نام و تلفن در outbox plaintext نباشند؛ logout یا تغییر principal کلید و DB قبلی را از دسترس خارج کند؛ PutObject بدون encryption policy رد شود؛ و threat model به‌طور صریح محدودیت حفاظت browser-side در برابر XSS را توضیح دهد.

#### P4-B06 — مسیر release immutable و rollback قابل تمرین

Compose production از build context محلی استفاده می‌کند. CI image را در runner می‌سازد و حذف می‌کند؛ registry promotion، digest pinning، SBOM/provenance/attestation و rollback application/schema تعریف‌شده مشاهده نشد. این وضعیت با مهاجرت‌های forward-only که فقط نام فایل را ثبت می‌کنند ترکیب شده و risk rollback را بالا می‌برد. [8] [16]

**راهکار پیشنهادی:** build پس از gate یک بار انجام شود، image با digest immutable به registry خصوصی برود، SBOM و provenance تولید و image امضا شود. staging و production باید دقیقاً همان digest را promote کنند؛ `prod.yml` نباید source محلی build کند. migrator باید advisory lock، checksum migration، test برای migration تغییرکرده و policy expand/migrate/contract داشته باشد. rollback application فقط تا نسخه‌ای مجاز باشد که با schema فعلی سازگار است.

**معیار پذیرش:** release record شامل commit SHA، digest، migration set، approver و CI link باشد؛ migration هم‌زمان serialize شود؛ تغییر migration اجراشده fail شود؛ و rollback application/schema در staging drill شود.

### ۴.۲ بدهی‌های مهم قابل رفع در موج‌های P4

| ID | شدت | موضوع | راهکار کوتاه |
|---|---|---|---|
| P4-R01 | بالا | `useConditionMapping` دارای `any` و lint suppression است | قرارداد typed، `ConditionKey` نسخه‌دار، حذف suppression و unit test matcherها |
| P4-R02 | بالا | coverage مسیرهای privacy/sync/dashboard کافی نیست | threshold مستقل line/function/branch برای privacy، storage، sync، hooks/components و dashboard integration |
| P4-R03 | بالا | E2E upload در stack mock اجرا می‌شود | lane واقعی MinIO/S3 با CORS، presigned PUT/GET، multipart/resume و tenant-negative test |
| P4-R04 | بالا | template production برای `PHI_KEY_RING` ناقص است | schema، placeholder fail-closed، راهنمای تولید امن و preflight validation |
| P4-R05 | بالا | Firebase credential/config تاریخی حذف شده اما revoke/rotation اثبات نشده است | revoke/rotate provider-side، بررسی tag/fork/exposure و ثبت evidence غیرمحرمانه |
| P4-R06 | بالا | dialogها و signature برای keyboard/screen reader ناقص‌اند | primitive مشترک dialog، focus trap/restore، semantic labels و مسیر امضای جایگزین قابل ممیزی |
| P4-R07 | متوسط | rate limit پشت Caddy ممکن است IP proxy را ببیند | trust proxy محدود به CIDR Caddy، stripping header و integration test spoof/isolation |
| P4-R08 | متوسط | statusهای sync/analysis error یا fake conflict را پنهان می‌کنند | UI state machine و inspector صرفاً برای دادهٔ واقعی و redacted |
| P4-R09 | متوسط | CSP غیرفعال و token در sessionStorage است | CSP Report-Only سپس enforce؛ `connect-src` دقیق و telemetry violation |
| P4-R10 | متوسط | health backup فقط زنده‌بودن cron را می‌سنجد | `last-run.json` با RPO، stale/fail unhealthy و alert |
| P4-R11 | متوسط | logging rotation/retention و Caddy ingress test صریح نیست | logging policy، `caddy validate`، proxy smoke و header test |
| P4-R12 | متوسط | i18n/RTL و reduced-motion در چند surface ناقص‌اند | key parity، direction test، literal scan، `prefers-reduced-motion` و pause canvas |
| P4-R13 | متوسط | نسخهٔ محیط Node با engine transitive ناسازگار است | CI/README/dev container را روی Node حداقل 22.22.x pin کنید |

## ۵. برنامهٔ اجرایی بستن فاز ۴

این برنامه باید به صورت sliceهای عمودی کوچک اجرا شود. هیچ slice نباید هم‌زمان dashboard clinical، security controls و release topology را بی‌دلیل تغییر دهد. هر slice باید شامل pre-change checklist، کد، test بازتولیدکننده، typecheck/lint/test/build/conformance، completion note و evidence CI باشد.

### موج ۱ — ایمنی مسیر اصلی و صحت داده

**هدف:** هیچ کاربر پس از login نتواند دادهٔ ساختگی را به‌عنوان پرونده یا خروجی بالینی واقعی تلقی کند.

| Slice | خروجی | آزمون‌های لازم | DoD |
|---|---|---|---|
| 4A.1 | تصمیم رسمی درباره dashboard: API-first یا demo/read-only | E2E post-login route | مسیر login فقط workflow مرجع را باز کند |
| 4A.2 | اتصال patient CRUD و media به API/query/outbox واحد | integration + offline/reconnect + refresh | ایجاد/حذف/آپلود persistent و tenant-scoped باشد |
| 4A.3 | حذف synthetic analysis/capture/PDF از production یا اتصال کامل provenance | negative tests برای report/review | بدون image/hash/review/report ID، artifact بالینی صادر نشود |
| 4A.4 | authenticated shell شامل AutoLock و cleanup | E2E inactivity/history/refresh | همهٔ protected routeها یک policy session داشته باشند |

**معیار خروج موج ۱:** یک test سرتاسری از login تا ثبت بیمار، upload، قطع شبکه، reconnect، refresh، مشاهده مجدد و logout پاس شود. هیچ واژهٔ Verified/Signed/Prescription در path production بدون proof server-side باقی نماند.

### موج ۲ — حفاظت داده و امنیت عملیاتی

**هدف:** policy دادهٔ آفلاین، encryption-at-rest، secret lifecycle و مرز proxy قابل اثبات شود.

| Slice | خروجی | آزمون‌های لازم | DoD |
|---|---|---|---|
| 4B.1 | ADR برای offline PHI و implementation متناظر | IndexedDB inspection + logout/key lifecycle | plaintext غیرمجاز باقی نماند |
| 4B.2 | encryption policy برای media/identifierها | bucket policy + health/boot failure | absence encryption fail-closed باشد |
| 4B.3 | Fastify/Nest remediation و lockfile update | audit + auth/CORS/rate-limit suite | هیچ advisory Moderate+ runtime نماند یا acceptance معتبر داشته باشد |
| 4B.4 | proxy trust، CSP report-only و historical Firebase closure | integration spoof test + CSP header test | IP trust و XSS defense-in-depth قابل سنجش باشد |

**معیار خروج موج ۲:** security review مستقل، audit runtime، secret scan و testهای negative امنیتی سبز باشند؛ provider-side rotation evidence بدون افشای secret ثبت شود.

### موج ۳ — release engineering و قابلیت بازیابی

**هدف:** همان artifact تأییدشده deploy شود و بازگشت از failure پیش‌بینی‌پذیر باشد.

| Slice | خروجی | آزمون‌های لازم | DoD |
|---|---|---|---|
| 4C.1 | GitHub ruleset و release policy | merge-denial آزمایشی | gate قابل دور زدن نباشد |
| 4C.2 | immutable image promotion + SBOM/provenance/signature | staging promotion smoke | prod digest مصرف کند |
| 4C.3 | checksum/advisory lock migration و expand/contract policy | concurrent/modified migration tests | تاریخ migration immutable باشد |
| 4C.4 | `PHI_KEY_RING` preflight، Caddy validation، logging و backup freshness | compose config + proxy + stale backup scenarios | bootstrap و RPO evidence قابل اجرا باشد |

**معیار خروج موج ۳:** یک deploy به staging با digest promoted، migration، ingress Caddy و rollback application compatible انجام و evidence آن ثبت شود.

### موج ۴ — بستن بدهی dashboard، accessibility و قراردادی

**هدف:** refactor ظاهری به مرزهای قابل نگهداری و قابل استفاده تبدیل شود.

| Slice | خروجی | آزمون‌های لازم | DoD |
|---|---|---|---|
| 4D.1 | `ConditionKey` و `useConditionMapping` typed | matcher/fallback/null tests | zero `any` و zero lint suppression در feature |
| 4D.2 | modal host/shared dialog primitive | keyboard, focus, axe tests | focus trap/restore و name/semantics همه modalهای حساس |
| 4D.3 | state machine برای sync/error/analysis | 500/timeout/dead-letter/conflict tests | status واقعی و redacted نمایش داده شود |
| 4D.4 | consent sync یا feature gate؛ PWA policy واقعی | offline/reconnect browser tests | promise محصول با رفتار runtime همسو باشد |
| 4D.5 | i18n/RTL/motion completion | fa/en parity + reduced-motion tests | literal/direction mismatch در surfaceهای حساس صفر باشد |

**معیار خروج موج ۴:** dashboard integration suite، accessibility suite و locale parity suite در CI اجباری باشند؛ مسیر legacy و dashboard هم‌زمان به‌عنوان workflow اصلی نگه‌داری نشوند.

### موج ۵ — اثبات کیفیت و gate خروج فاز ۴

**هدف:** بسته‌شدن فاز با evidence باشد، نه با checkbox.

| حوزهٔ gate | حداقل معیار |
|---|---|
| توسعه محلی | clone تمیز با دستور مستند؛ preflight واضح برای env و service؛ `test:unit` و `test:integration` تفکیک‌شده |
| آزمون | coverage per-domain برای privacy/retention/storage/sync/dashboard؛ branch و function threshold علاوه بر line |
| E2E | login→dashboard مرجع؛ storage واقعی MinIO/S3؛ upload/resume/tenant-negative؛ consent؛ lock؛ report negative |
| عملکرد | baseline versioned برای login، patient، gallery، upload و dashboard؛ Web Vitals و memory/DOM budget |
| عملیات | Caddy ingress، monitoring scrape/alert، backup freshness، restore drill، release/rollback drill |
| مستندات | یک status ledger واحد با evidence؛ roadmap/refactor/progress بدون تناقض |
| استقلال | GATE_REVIEW بیرونی با PASS و لینک به commit، CI logs و tests |

## ۶. نقشهٔ ورود امن به فاز ۵

فاز ۵ در roadmap پروژه «رشد تجاری، Aftercare-first» است. این هدف منطقی است، اما صرفاً پس از PASS موج‌های فاز ۴ باید شروع شود. ترتیب زیر توسعه را از کم‌ریسک‌ترین و بیشترین ارزش تجاری به سمت پرریسک‌تر هدایت می‌کند.

### ۶.۱ Slice 5.0 — قراردادهای تجاری و رضایت ارتباطی

ابتدا مدل domain را در `@scalpai/shared` تعریف کنید: `CommunicationConsent`، preference کانال، quiet hours، language، template version، patient contact eligibility، correlation ID و audit metadata. این اطلاعات باید tenant-scoped، versioned و مستقل از provider باشند. هر پیام باید حداقل PHI را داشته باشد و در صورت نیاز فقط لینک tokenized کوتاه‌عمر ارسال کند.

**معیار پذیرش:** بیمار بدون consent یا خارج از quiet hours پیام نگیرد؛ همهٔ تصمیم‌های ارسال قابل audit باشند؛ و یک test policy برای tenant، role و preference وجود داشته باشد.

### ۶.۲ Slice 5.1 — Aftercare Engine بدون وابستگی مستقیم به provider

Aftercare engine باید sequenceهای JSON نسخه‌دار را به commandهای قابل idempotency تبدیل کند. state machine پیشنهادی عبارت است از `scheduled → eligible → queued → sent → delivered/failed → acknowledged/expired`. endpointهای domain نباید SDK پیام‌رسان را import کنند؛ یک application service و یک interface adapter لازم است. outbox سروری و deduplication key از ارسال تکراری پس از retry جلوگیری می‌کند.

**معیار پذیرش:** یک sequence برای یک درمان نمونه از ثبت تا timeout/retry در PostgreSQL واقعی اجرا شود؛ هر transition audit شود؛ و replay یک command پیام تکراری ارسال نکند.

### ۶.۳ Slice 5.2 — Messaging Gateway و ماتریس کانال‌ها

adapterهای SMS، Bale، Eitaa، Telegram، سپس WhatsApp باید با contract test مشترک اضافه شوند. inbound webhook، signature verification، rate limit، dead-letter، opt-out و template approval باید از همان ابتدا جزو scope باشند. کانال‌ها تنها implementation detail هستند؛ workflow Aftercare نباید به provider خاص قفل شود.

**معیار پذیرش:** contract test هر adapter برای success، timeout، duplicate callback، invalid signature، opt-out و provider outage؛ sandbox integration برای هر کانال فعال؛ و هیچ متن PHI در log یا payload غیرضروری نباشد.

### ۶.۴ Slice 5.3 — No-show، inbox و operability

پس از ارسال پایدار، reminder no-show و inbox را اضافه کنید. inbound message باید به patient/clinic فقط پس از verification دقیق متصل شود و پیام‌های نامطمئن به queue دستی بروند. dashboard عملیاتی باید status واقعی و redacted داشته باشد، نه activity mock.

**معیار پذیرش:** inbox tenant-scoped، role-gated، قابل audit و دارای SLA/status باشد؛ duplicate inbound پیام یا callback در state machine یک بار پردازش شود.

### ۶.۵ Slice 5.4 — Metering، invoice/POS و پرداخت

billing و درگاه پرداخت را بعد از تثبیت workflow پیام‌رسانی شروع کنید. invoice باید ledger قابل تغییرناپذیر، money type دقیق، tax/discount versioning و payment provider adapter داشته باشد. هیچ webhook مالی بدون signature verification و idempotency وارد domain نشود.

**معیار پذیرش:** حالت‌های پرداخت موفق، ناموفق، pending، duplicate webhook، refund/cancel و mismatch amount با testهای integration پوشش داده شوند. این قابلیت نباید پیش از تأیید مدل حقوقی/مالی محصول production شود.

### ۶.۶ Slice 5.5 — Patient Portal به‌عنوان محصول واقعی، نه scaffold

Portal باید آخرین slice یا یک scope جدا باشد؛ زیرا OTP auth، authorization patient، consent، report delivery و PWA policy جدید ایجاد می‌کند. در نسخهٔ اول صرفاً read-only approved results، report delivery امن، preference ارتباطی و appointment request ارائه شود. AI output باید فقط پس از review متخصص و با برچسب non-diagnostic نمایش داده شود.

**معیار پذیرش:** بیمار فقط دادهٔ خود را می‌بیند؛ session/OTP و audit مستقل دارد؛ portal بدون service worker و offline policy واقعی با عنوان PWA production معرفی نمی‌شود.

## ۷. ترتیب اولویت و مالکیت پیشنهادی

| اولویت | بازه | مالک اصلی پیشنهادی | خروجی قابل سنجش |
|---|---|---|---|
| P0 | موج ۱ | Frontend + API owner + clinical product owner | dashboard API-first یا demo-only و حذف claimهای ساختگی |
| P0 | موج ۳، Slice 4C.1 | Repository/DevOps owner | ruleset اجباری روی main |
| P0 | موج ۲، Slice 4B.3 | API/security owner | Fastify remediation و audit clean |
| P0 | موج ۱، Slice 4A.4 | Frontend/security owner | authenticated shell و lock E2E |
| P1 | موج ۲ | Security + platform owner | offline PHI ADR و encryption policy قابل اثبات |
| P1 | موج ۳ | DevOps/platform owner | immutable promotion، migration integrity و rollback drill |
| P1 | موج ۴ | Frontend owner + QA | dialog/a11y، real sync state، consent/PWA policy |
| P1 | موج ۵ | QA/Release owner | test bootstrap، real-storage E2E، coverage per-domain |
| P2 | فاز ۵.۰ تا ۵.۲ | Product/API/integration owner | aftercare + messaging adapter با compliance controls |
| P2 | فاز ۵.۳ تا ۵.۵ | Product/API/portal owner | inbox، billing و portal پس از گیت هر slice |

## ۸. نتیجهٔ نهایی

**پروژه ارزش ادامه‌دادن دارد و زیرساخت قابل توجهی ساخته است.** پاسخ حرفه‌ای به بدهی‌های فعلی، حذف یا بازنویسی شتاب‌زدهٔ کل محصول نیست. باید همان دقتی که در RLS، audit، backup و conformance به کار رفته، به مسیر واقعی user-facing dashboard و release path نیز منتقل شود.

تا زمانی که موارد P4-B01 تا P4-B09 و gate خروج موج ۵ بسته نشده‌اند، پیشنهاد می‌شود فاز ۵ فقط در حد طراحی domain، ADR و spikeهای بدون production exposure پیش برود. پس از PASS مستقل فاز ۴، شروع **Aftercare Engine** به‌عنوان اولین vertical slice فاز ۵ بهترین گزینه است، زیرا ارزش تجاری سریع ایجاد می‌کند و با قرارداد، consent، audit، outbox و adapter boundaryهای پیشنهادی سازگار است.

## References

[1]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/package.json "Root package scripts and dependency audit policy"
[2]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/vitest.config.ts "Vitest configuration and coverage scope"
[3]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/PROJECT_GRAPH.md "ScalpAI workspace dependency graph"
[4]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/docs/engineering-rules.md "Engineering rules and merge-gate policy"
[5]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/api/src/auth/jwt-access.guard.ts "JWT access guard implementation"
[6]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/packages/db/src/phi-crypto.ts "PHI encryption implementation"
[7]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/.github/workflows/ci.yml "Continuous integration workflow"
[8]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/ops/prod.yml "Production Docker Compose topology"
[9]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/i18n.ts "Web localization and RTL implementation"
[10]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/vite.config.ts "Vite route and vendor chunk configuration"
[11]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/hooks/useDashboardRecords.ts "Dashboard patient state hook"
[12]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/pages/PatientsPage.tsx "Canonical patient API and offline mutation path"
[13]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/hooks/useDashboardAnalysis.ts "Dashboard analysis workflow hook"
[14]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/components/ClinicalPdfReportModal.tsx "Clinical PDF report modal"
[15]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/apps/web/src/offline/db.ts "Browser offline data store"
[16]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/packages/db/src/migrate.ts "Database migration runner"
[17]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md "Clinical dashboard refactor roadmap"
[18]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/docs/PROGRESS.md "Project phase progress tracker"
[19]: https://github.com/parssystem1-coder/scalpai/blob/2650ef91d2bca315c5eb38cd522ad8b65c80f463/docs/WEAKNESSES-V2-10-PHASES.md "Technical debt remediation ledger"

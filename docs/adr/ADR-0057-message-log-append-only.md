# ADR-0057: `message_log` و `inbound_messages` append-only هستند — `deleted_at` اضافه نمی‌شود (موج ۵ / D22)

- Status: accepted
- Date: 2026-09-28
- Supersedes: هیچ‌چیز. فقط اختیار حذف/بازنویسیِ `packages/db/src/repos/retention.repo.ts` روی دو جدول پیام را محدود می‌کند؛ بقیه‌ی retention دست‌نخورده می‌ماند.
- Related: D22 در `docs/reviews/PHASE5-DEBT-WAVES.md` · ADR-0050 (immutable digest — الگوی گزارش‌دهی تخلف در تیک‌ورکر) · ADR-0056 (الگوی «کار سند بدهی مستقل از POS») · §7 (نگه‌داری) و §13 سند طرح

## Context

سند بدهی برای D22 دو مسیر مجاز گذاشته بود: ستون `deleted_at` (حذف نرم + فیلتر live در کوئری‌ها) یا ADR با تصمیم append-only. روی `message_log` (اعلان‌های خروجی) و `inbound_messages` (پاسخ بیمار) دو نیروی مخالف هم‌زمان اثر می‌کند:

- **§7 (نگه‌داری):** گزینه‌ی `deleted_at` یعنی مسیر فعلی — retention بلوک‌های بیش از ۹۰ روز را واقعاً `DELETE` می‌کند و سلامت پاک‌سازی با «کاهش تعداد ردیف» اندازه‌گیری می‌شود.
- **§13 و اصل «لاگ حسابداری»:** درخواست‌های SMS خروجی و پاسخ‌های بیمار سندِ اینکه «چه چیزی به نام کلینیک و با چه توجیهی از درگاه خارج شد» است. حذف نرم به‌خودی‌خود قابل انکار است — هیچ‌چیز جلوی `UPDATE ... SET deleted_at = now()` را نمی‌گیرد؛ همان کلاس تهدیدی که حذف سخت دارد، فقط ضعیف‌تر.

حذف نرم یعنی فیلتر `deleted_at IS NULL` به ۷+ محل کوئری (لیست پیام‌ها، inbox، کانترها، retention) تزریق شود — و هیچ‌کدام از آن‌ها ادعای §13 را قوی‌تر نمی‌کند؛ فقط `DELETE` را به `UPDATE` قابل‌انکار تبدیل می‌کند. بسته‌شدن D22 با `deleted_at` «قابلیت حذف قابل انکار» می‌خرد، نه یکپارچگی.

## Decision

1. **هر دو جدول append-only اعلام می‌شوند.** هیچ مسیر code حق بازنویسی محتوای ثبت‌شده یا حذف ردیف ندارد؛ عملیات مجاز فقط تکامل وضعیت رو به جلو و پر کردن placeholder (پایین) است. پس از اعمال 0025، هر `DELETE` روی این دو جدول و هر `UPDATE` خارج از الگوی مجاز در سطح **دیتابیس** خطا می‌دهد، نه فقط در code review.
2. **مکانیزم:** migration 0025 تابع trigger `fn_message_no_mutate()` + دو trigger روی هر دو جدول می‌سازد. ردیف‌های `message_log` بدو تولد به‌صورت placeholder (`state='queued'`، بدون body) متولد می‌شوند و ورکر آن‌ها را درجا پر می‌کند؛ این تکاملِ محدود **مجاز** است. آنچه ممنوع است:
   - `DELETE` در هر حالت.
   - `UPDATE` محتوایی پس از تولد: `clinic_id`, `idempotency_key`, `channel`, `recipient_hash`, `patient_id`, `session_id`, `enrollment_id`, `body`, `body_key_id`, `body_sha256`, `body_preview`, `body_chars`, `sent_at`, `delivered_at`, `failed_at`, `last_error`, `provider`, `provider_message_id`, `vars_redacted`, `locale`, shadows (`*_parent_clinic_id`).
   - گذر وضعیت رو به عقب یا پرش نامجاز روی `message_log`: فقط `queued→sent`, `queued→failed`, `sent→delivered`, `sent→failed`, و `state→state` (بی‌اثر) مجاز است.
   - روی `inbound_messages`: `DELETE` ممنوع؛ وضعیت فقط رو به جلو در زنجیره‌ی `new→read→replied→archived` (+ `state→state` بی‌اثر)؛ `intent` فقط از `NULL` (یا بی‌اثر)؛ `handled_by`/`handled_at` فقط از `NULL` (یا بی‌اثر)؛ بقیه‌ی ستون‌ها (`body_*`, refs, shadows) پس از درج ثابت‌اند.
3. **`updated_at` همیشه مجاز است** (`setInboundState`/fill مسیرها آن را به‌روزرسانی می‌کنند)؛ گارد فقط تغییرات محتوایی را می‌سنجد و `updated_at` را از سنجش خارج می‌کند.
4. **سیاست نگه‌داری پیام‌ها (§7) با این ADR بازتعریف نمی‌شود** — پاک‌سازی فعلی retention روی این دو جدول را سیاست بعدی مالکیت می‌کند: هر آینده‌ای (anonymize پس از expiry در Data Lake فاز ۶، یا سیاست تازه‌ی مستند) باید **پس از این ADR** با ADR تازه و migration ای که trigger را موقتاً کنار می‌گذارد بیاید. بسته‌شدن D22 معنایشش این نیست که داده‌ی پیام برای همیشه نگه داشته می‌شود؛ معنایشش این است که حذف/بازنویسی هرگز مسیر عادی نیست.
5. **الگوی ADR-0050 برای حلقه‌ی بازخورد:** اگر ترتیب گاردی تخلف گزارش شود، تیک‌ورکر (ops) همان مسیر گزارش/پرچم را می‌گیرد — قاعده‌ی «observer never fails the request»: منطق درخواست به‌هم نمی‌ریزد؛ ورکر پرچم می‌زند و ادامه می‌دهد.

## Consequences

- **مثبت:** §13 حالا با قید دیتابیسی زنده است: پیام ورودی/خروجی قابل حذف یا بازنویسی نیست؛ حذف نرم قابل‌انکار و حذف سخت هر دو بسته شدند. فاز ۶ (Data Lake بی‌نام‌سازی) آن سیاست حذف/ناشناس‌سازی را در Data Lake می‌گیرد، نه در انبار پیام.
- **مثبت:** صفر کوئریِ تغییر یافته — هیچ فیلتر `deleted_at IS NULL` تازه‌ای به کوئری‌های موجود تزریق نمی‌شود و مسیر پرریسک فیلتر live در ۷+ محل باز نمی‌شود.
- **هزینه‌ی پذیرفته‌شده (۱):** ابزارهایی که ناچار به خالی‌کردن جداول تست‌اند، از TRUNCATE عبور می‌کنند: triggerهای row-level روی TRUNCATE اجرا نمی‌شوند و `resetAll` (packages/db/src/testing.ts) همین مسیر را دارد — هیچ تغییری در آن لازم نشد؛ نقش‌های اپ به هیچ‌کدام دسترسی ندارند (همان گاردهای 0012/0017).
- **هزینه‌ی پذیرفته‌شده (۲):** خطاهای گارد (کلاس `S23514`-مانند، `msg_no_mutate`) که امروز در runDue/inbox فقط لاگ می‌شوند، پس از دیپلوی 0025 سخت‌گیرانه‌تر عبور می‌کنند؛ این بدهیِ شناخته‌شده است و در موج ۶ بازبینی می‌شود.
- **قاعده‌ی آینده:** اگر کلینیک نیاز به حذف واقعی پیام‌ها پیدا کرد (درخواست حذف بیمار، حکم قضایی)، مسیر همان الگوی D09/ADR-0056 است: ADR تازه + migration/abeyance مستند — نه یک `DELETE` بی‌سند.
## جزئیات اجرا (0025)

- `fn_message_no_mutate()`: بر اساس `TG_TABLE_NAME` شاخه می‌زند. `message_log`: گذر وضعیت فقط `queued→sent|failed|suppressed`، `sent→delivered|failed` و بی‌اثر؛ پر کردن placeholder فقط در فاز `queued` (مسیر fillSessionReminder/markMessageSent)؛ پس از آن فقط state/زمان‌ها/attempts/last_error/updated_at. `inbound_messages`: زنجیره‌ی `new→read→replied→archived` رو به جلو (+ بی‌اثر)؛ `handled_by/handled_at/intent` آزادند (متادیتای رسیدگی‌اند، نه محتوا)؛ body/refs/shadows پس از درج ثابت. `DELETE` هر دو ممنوع؛ TRUNCATE عمداً بای‌پس می‌ماند (مسیر تست/بازیابی، خارج از دسترس نقش‌های اپ).
- rollback: drop هر دو trigger + تابع.
- چک تطبیق: `trg_message_log_no_mutate` و `trg_inbound_no_mutate` باید وجود داشته باشند؛ `message_log`/`inbound_messages` بدون بای‌پس قابل DELETE نیستند.

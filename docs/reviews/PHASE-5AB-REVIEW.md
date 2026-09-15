# بازبینی کیفیت کد — Phase 5a + 5b

> دامنه: ۴۵ فایل فاز ۵a/۵b (aftercare · messaging · billing · metering · payment gateway · webhook guard · inbox UI) روی `main`.
> مرجع: `docs/engineering-rules.md` · `docs/DESIGN-V2.md` §6.2 / §13 / §18 · `docs/playbooks/phase-5-growth-commerce.md`.
> این بازبینی روی سورس انجام شده است؛ `typecheck`/`lint`/`conformance`/`test` در این پاس اجرا نشده‌اند و باید قبل از merge اجرا شوند.

---

## ۱. مسدودکننده‌ها (Blocker) — نیازمند مهاجرت یا تصمیم معماری

| # | محل | مشکل | چرا مهم است |
|---|-----|------|--------------|
| B1 | `apps/api/src/aftercare/inbound.controller.ts` + `tenancy/tenant.scope.ts:57-70` | webhook عمومی هیچ tenant context ندارد. `WebhookGuard` فقط HMAC را چک می‌کند و `TenantScope.runWith` صدا زده نمی‌شود؛ بعد `recordInbound()` → `TenantScope.tx()` → `requireCtx()` خطا می‌دهد. | مسیر happy path نمی‌تواند callback را ذخیره کند؛ و اگر context از جای دیگری و بدون بایند به mapping تأیید‌شده‌ی provider→clinic ست شود، این endpoint یک ابزار نوشتنِ cross-tenant می‌شود. قاعده ۱. |
| B2 | `apps/api/src/billing/webhook.guard.ts:29-34` | HMAC بدون timestamp/nonce → replay نامحدود. | یک درخواست امضاشده‌ی ضبط‌شده (مثلاً `STOP` یا رویداد پرداخت) برای همیشه معتبر است. نیاز: پنجره‌ی زمانی امضاشده + جدول `webhook_events` با یکتایی `(provider, provider_event_id)`. |
| B3 | `apps/api/src/billing/payment.service.ts:26-29,39-119` | state پرداخت و idempotency در حافظه‌ی پروسه (`Map`) است. | ریستارت = گم شدن authority؛ راپلیکای دوم = authority تکراری؛ callback موفق ماندگار ثبت نمی‌شود → تراکنش پرداخت‌شده معلق یا verify دوباره. باید ردیف payment_attempt با unique constraint و state machine در Postgres باشد. |
| B4 | `packages/db/src/schema.ts:307-405` + `sql/0017` | FK های tenant-owned تک‌ستونی‌اند (`patient_id REFERENCES patients(id)`)، بدون `(clinic_id, id)`. | کلینیک A می‌تواند به ردیف معتبر کلینیک B ارجاع بدهد؛ tenant isolation عملاً نقض می‌شود. نیاز: composite FK یا بررسی وجود در همان تراکنش + تست منفی روی Postgres واقعی. |
| B5 | `packages/db/src/schema.ts:250-374` | `aftercare_enrollments` / `message_log` / `inbound_messages` / `usage_counters` ستون `deleted_at` ندارند. | قاعده soft-delete جداول business. اگر این جداول عمداً append-only هستند، باید ADR/exception صریح داشته باشند نه سکوت. |

---

## ۲. یافته‌های High

1. `aftercare.worker.ts:64-66` — کشف زمان‌بندی از `DbService.withClient` بدون `SET LOCAL app.clinic_id`. مسیر privileged (SECURITY DEFINER در 0018) هست ولی در `tools/conformance/exceptions.json` ثبت نشده و به‌عنوان تراکنش عمومی در دسترس است.
2. `aftercare.service.ts:178-217` — N+1: به‌ازای هر enrollment در batch، پرس‌وجوی بیمار + opt-out + insert پیام + metering. batch ۵۰ تایی = ده‌ها رفت‌وبرگشت در یک تراکنش. راه‌حل: bulk-load با `inArray` در همان claim.
3. `aftercare.service.ts:208-254` — «هر ردیف پیامِ موجود» با «قبلاً ارسال شده» یکی گرفته می‌شود؛ ردیف `failed` می‌تواند retry را بلوکه کند و enrollment را بی‌صدا جلو ببرد.
4. `aftercare.service.ts:225-254` — متن خطای خام provider در `lastError` ذخیره می‌شود (احتمال شماره تلفن/بدنه‌ی درخواست) → نقض §13. باید کد خطای محدود + شناسه‌ی همبستگی ذخیره شود.
5. `aftercare.service.ts:18-24` — سرویس مستقیم `getAdapter()` را صدا می‌زند؛ آداپتور باید با DI token تزریق شود (تست‌پذیری + مرز معماری).
6. `payment.service.ts:31-36` — `@Optional()` + `new ZarinpalAdapter()` به‌عنوان fallback تولیدی. پیکربندی غلط باید startup را بشکند، نه در لحظه پرداخت ظاهر شود.
7. `payment.controller.ts:12-24` — ورودی عمومی callback (`Authority`, `Status`) با zod مشترک اعتبارسنجی نمی‌شود و `@RateLimit` ندارد.
8. `webhook.guard.ts:22`, `tenant.scope.ts:68`, `quota.guard.ts:52` — خطاها `{code,message,details?}` نیستند (`UnauthorizedException` و `Error` خام). نیاز: exception filter سراسری + contract test.
9. `aftercare.repo.ts:332-380,445-477` — گذارهای state با read-then-write بدون compare-and-set؛ دو pause/resume همزمان یکدیگر را بازنویسی می‌کنند.
10. `messaging.repo.ts:335-464` — `markMessageFailed`/`markMessageSuppressed` هر ردیفی را آپدیت می‌کنند، از جمله `delivered`؛ یک retry می‌تواند نتیجه‌ی تحویل را بازنویسی کند.
11. `packages/shared/src/aftercare.ts:57` + `messaging.repo.ts:30-35` — موبایل فقط `09xxxxxxxxx` است و hash روی همان مقدار خام گرفته می‌شود؛ `+98…` و `09…` دو hash مختلف → opt-out و dedupe می‌شکند. باید E.164 canonical شود.
12. `billing.repo.ts:291-529` — عملیات چندمرحله‌ای (ساخت فاکتور، جایگزینی سطرها، پرداخت) به تراکنش caller تکیه دارد بدون تضمین؛ شکست میانی = فاکتور بدون سطر یا total ناهمخوان.
13. `apps/web/src/pages/InboxPage.tsx` — (اصلاح شد) خطای بارگذاری unhandled rejection بود، متن پاسخ هرگز ارسال نمی‌شود، خطای خام به console می‌رفت، مسابقه‌ی انتخاب پیام.

---

## ۳. یافته‌های Medium / Low (خلاصه)

- `@Param("id")` ها هیچ‌جا با zod مشترک اعتبارسنجی نمی‌شوند (aftercare + billing controllers).
- `metering.service.ts:31-66` — resolve کردن entitlement بیرون از تراکنشِ مصرف؛ limit و counter در دو snapshot دیده می‌شوند.
- `quota.guard.ts` — عمداً اتمیک نیست؛ باید conformance check ثابت کند هر endpoint دارای `@Quota` رزرو اتمیک هم دارد.
- pagination در repository ها بی‌کران است و ordering بدون tie-breaker (`id DESC`) → صفحه‌های ناپایدار.
- ایندکس‌های پیشنهادی (بعد از `EXPLAIN ANALYZE`): `aftercare_sequences (clinic_id, created_at DESC)`, `aftercare_enrollments (clinic_id, sequence_id, created_at DESC)`, `message_log (clinic_id, queued_at DESC)`, `message_log (clinic_id, channel, provider_message_id, state)`, `inbound_messages (clinic_id, channel, received_at DESC)`, `invoices (clinic_id, created_at DESC) WHERE deleted_at IS NULL`.
- `as any` در همه‌ی spec ها و چند cast از `unknown` در repo ها؛ snapshot های JSON (`asSteps`, `hydrate`) بدون parse با zod.
- خطاهای دامنه (`AftercareError`, `BillingError`, …) فقط `name`+`message` دارند، بدون `code`/`details`.
- `zarinpal.adapter.ts` از پورت HTTP مشترک استفاده نمی‌کند (transport دوم و `fetch` مستقیم).
- چهار آداپتور stub (bale/eitaa/telegram/whatsapp) هیچ spec اختصاصی ندارند؛ `whatsapp.parseInbound` فقط پیام اول webhook را برمی‌دارد و بقیه را بی‌صدا می‌اندازد.
- specs لایه‌ی db همه mock-only هستند: RLS، cross-tenant، `FOR UPDATE SKIP LOCKED`، همزمانی metering، رمزنگاری/AAD و rollback تست نمی‌شوند. ادعای پوشش ≥۷۰٪ با این تست‌ها معنا ندارد.
- `queue.port.ts:6-10,108-112` — راهنمای اپراتور از `npm install` و `package-lock.json` می‌گوید. مخزن واقعاً `package-lock.json` دارد، ولی `engineering-rules.md` §6 از pnpm حرف می‌زند: **این تناقض سند/مخزن باید یک‌بار برای همیشه حل شود** (در این پاس تغییر نداده‌ایم تا CI نشکند).

---

## ۴. اصلاحات اعمال‌شده در این پاس

| فایل | تغییر | دلیل |
|------|-------|------|
| `packages/notify/src/adapters/kavenegar.adapter.ts` | وضعیت HTTP بر بدنه‌ی provider اولویت دارد | HTTP 500 با بدنه‌ی `return.status: 200` قبلاً «rejected غیرقابل‌retry» می‌شد، یعنی یک قطعی گذرا پیام را حذف می‌کرد |
| `packages/notify/src/adapters/kavenegar.spec.ts` | دو تست: 500 با بدنه‌ی متناقض، 502 بدون بدنه | تثبیت رفتار بالا |
| `packages/notify/src/adapters/zarinpal.adapter.ts` | `assertRialAmount` روی `requestPayment`/`verifyPayment` + عبور دادن `NotifyError` در verify | مبلغ صفر/منفی/کسری/تومانی قبل از تماس با درگاه رد می‌شود؛ اشتباه ریال/تومان ۱۰ برابر مبلغ است |
| `packages/notify/src/adapters/zarinpal.spec.ts` | تست مبالغ نامعتبر + پاسخ non-2xx در verify | جلوگیری از بازگشت verified روی 502 |
| `packages/notify/src/template.ts` | کنترل مقدار متغیرها (کاراکتر کنترلی، ایمیل، لینک خام، رشته رقمی ≥۸) | §13: پیام خروجی فقط متن عمومی + لینک توکن‌دار |
| `apps/api/src/billing/webhook.guard.ts` | allow-list صریح provider→header | پیش‌فرضِ قبلی هر provider ناشناخته را به `x-webhook-signature` می‌فرستاد؛ یک غلط املایی در دکوراتور بی‌صدا هدر اشتباه را چک می‌کرد |
| `apps/api/src/aftercare/inbound.controller.ts` | `provider` مسیر zarinpal از روت امضاشده تعیین می‌شود | payload حق ادعای provider ندارد |
| `apps/web/src/pages/InboxPage.tsx` | catch + وضعیت خطا و retry، محافظ مسابقه‌ی درخواست متن، بازگشت به state قبلی، حذف `err` خام از console | خطا دیگر شبیه «صندوق خالی» نیست و PHI به کنسول نمی‌رود |
| `apps/web/src/components/inbox/MessageThread.tsx` | `bodyStatus` صریح (`idle/loading/loaded/error`) | `body === null` هم «در حال بارگذاری» بود هم «نشد» → گیر کردن دائمی در حالت loading |
| `apps/web/src/components/inbox/MessageCard.tsx` | استفاده از `formatDate` مشترک با منطقه‌زمانی کلینیک | قاعده ۹: فرمت ad-hoc تاریخ در کامپوننت ممنوع |
| `apps/web/src/pages/inbox.i18n.ts` (جدید) | ثبت کلیدهای گمشده‌ی `inbox.*` | `inbox.loadingBody`/`replyFailed`/`dismissError` در باندل نبودند و کاربر خودِ کلید را می‌دید |

---

## ۵. پرسش‌های باز (نیازمند تصمیم محصول/معماری)

1. **پاسخ در inbox چه معنایی دارد?** الان UI متن را می‌گیرد ولی فقط `{state:"replied"}` را PATCH می‌کند. اگر پاسخ واقعاً ارسال می‌شود، باید از router با قالب و لینک توکن‌دار برود (نه متن آزاد)؛ اگر فقط «رسیدگی شد» است، دکمه باید تغییر نام بدهد و composer حذف شود.
2. **واحد پول درگاه:** ریال یا تومان? تا وقتی نوعِ حامل واحد (مثلاً `RialAmount`) در `packages/shared` نباشد، این ریسک با هر caller جدید برمی‌گردد.
3. **مسیر webhook zarinpal روی قرارداد پیام ورودی:** zarinpal کانال پیام‌رسانی نیست. یا قرارداد رویداد پرداخت جدا شود یا مسیر حذف شود.
4. **جداول append-only:** `message_log` / `inbound_messages` تعمداً غیرقابل حذف‌اند? اگر بله، ADR بنویسیم و قاعده‌ی soft-delete را برایشان exception کنیم.
5. **pnpm یا npm?** سند و مخزن دو چیز می‌گویند.

---

## ۶. کارهای بعدی به ترتیب اولویت

1. جدول `webhook_events` + پنجره‌ی زمانی امضاشده + بایند provider→clinic (B1, B2).
2. جدول payment_attempt و state machine در دیتابیس (B3).
3. مهاجرت composite FK و `deleted_at` با expand→migrate→contract (B4, B5).
4. تست‌های ادغامی روی Postgres واقعی با دو کلینیک: RLS، cross-tenant، همزمانی claim/pause/advance، پرداخت تکراری، metering همزمان.
5. exception filter سراسری برای `{code,message,details?}` + contract test هر مسیر خطا.
6. حذف N+1 در `prepare()` و رزرو دسته‌ای سهمیه.
7. یکسان‌سازی transport آداپتورها روی `HttpClientPort` + retry/backoff مرکزی.

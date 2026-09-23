# Phase 5 Debt — Wave Plan (کد-به-کد، 2026-09-22)

> مبنای یافته‌ها: پلی‌بوک `docs/playbooks/phase-5-growth-commerce.md` · گیت `docs/gates/GATE_REVIEW_phase-5-2026-09-15.md` · بازبینی `docs/reviews/PHASE-5AB-REVIEW.md` · تطبیق با سورس روی `main` (`4bd1bf9` و بعد از آن).
> قاعدهٔ ثابت: هیچ معیاری با grep روی سورس بسته نمی‌شود؛ grep فقط برای قواعد *نبود*. هر موج با تست رفتاری + typecheck/lint سبز بسته می‌شود.
> این سند ledger بدهی فاز ۵ است، نه بازگشایی گیت. حکم گیت ۱۵ سپتامبر برای **۵a+۵b API** سر جایش است. ورود به فاز ۶ بلاک نیست. بدهی زیر follow-up است مگر خلافش در موج نوشته شود.

## حکم کوتاه

| لایه | واقعیت |
|---|---|
| گیت ۵a+۵b | PASS — CI/معماری، نه تکمیل پلی‌بوک |
| ۵.۶ پورتال | عمداً معوق (بعد از بازخورد کلینیک) |
| DoD پلی‌بوک #2 (Bale→SMS) | در گیت ✓ زده شده؛ **در ریپو نیست** |
| DoD پلی‌بوک #4 (UI ارتقا) | API ۴۰۳ هست؛ **UI راهنما نیست** |
| آداپتورها | Kavenegar واقعی · زرین‌پال واقعی (sandbox) · Bale/Eitaa/Telegram/WhatsApp در production پرتاب می‌کنند · SMS.ir نیست |

## موجودی بدهی (وضعیت زنده)

| ID | آیتم پلی‌بوک / بازبینی | وضعیت | موج |
|---|---|---|---|
| D01 | ماتریس کانال ایران در `ops/` | DONE | 1 |
| D02 | تست قرارداد قطع Bale → SMS | DONE | 1 |
| D03 | failover بعد از شکست ارسال (نه فقط انتخاب پیش از send) | DONE | 1 |
| D04 | B2 replay وب‌هوک (timestamp/nonce / event id) | DONE (StateStore TTL؛ جدول موج ۵) | 1 |
| D05 | `lastError` متن خام پروایدر (High #4) | DONE | 1 |
| D06 | PROGRESS/گیت صادق نیستند (۵ stub vs Kavenegar واقعی؛ UI ارتقا) | DONE | 1 |
| D07 | SMS.ir adapter | DONE (موج ۲؛ ADR-0052 + migration 0022) | 2 |
| D08 | Bale واقعی — Bot API روی HttpClientPort | DONE (موج ۲) · Eitaa واقعی → موج بعد | 2 |
| D09 | Telegram/WhatsApp واقعی | OUT-OF-SCOPE (ADR-0053 تا تقاضای کلینیک) | 2 |
| D10 | صفحه مصرف پلن owner + UI ارتقا | DONE (موج ۳؛ `GET /metering/usage` + صفحه `/usage`) | 3 |
| D11 | `@Quota` روی مسیر پیام / ۴۰۳ یکنواخت | DONE (موج ۳؛ `@Quota("messages")` + تست integration) | 3 |
| D12 | UI کلینیک aftercare (sequences/enrollments) | DONE (w4) | 3 |
| D13 | UI فاکتور | DONE (w4) | 3 |
| D14 | Inbox reply واقعاً ارسال نمی‌شود (Q1) | DONE (موج ۳؛ ADR-0054 — رسیدگی بدون متن آزاد) | 3 |
| D15 | no-show ۲۴س/۲س + recall | MISSING | 4 |
| D16 | `condition` / `on_reply` در steps | MISSING | 4 |
| D17 | `offset_days` مطابق DESIGN-V2 §6.2 | DRIFT (`offsetHours`) | 4 |
| D18 | لینک توکن‌دار منقضی‌شونده (§13) | MISSING (رندرر لینک را رد می‌کند) | 4 |
| D19 | POS + `stock_qty` | MISSING | 5 |
| D20 | `memberships` | MISSING | 5 |
| D21 | B4 composite FK | OPEN | 5 |
| D22 | B5 `deleted_at` یا ADR append-only | OPEN | 5 |
| D23 | مسیر zarinpal روی قرارداد inbound پیام (Q3) | WRONG CONTRACT | 5 |
| D24 | تست ادغامی Postgres واقعی (RLS/claim/pay) | MOCK-ONLY | 5 |
| D25 | ۵.۶ Patient Portal + `@portal` e2e + k6 booking | DEFERRED | 6 |

---

## موج ۱ — صداقت گیت + رساندن پیام در ایران (P0)

**هدف:** ادعای گیت با رفتار یکی شود و aftercare در ایران بدون دروغِ «ارسال شد» کار کند.

**پیشنهاد (انتخاب‌شده):** SMS-first عملیاتی. Kavenegar تنها کانال تولیدی اجباری است. مسنجرها تا موج ۲ stub می‌مانند و در production همچنان fail-closed هستند. شکست ارسال روی کانال ترجیحی باید **همان tick** به SMS بیفتد، نه defer خاموش.

| آیتم | کار | شواهد الزامی |
|---|---|---|
| D01 | `ops/iran-messaging-matrix.md`: SMS/Bale/Eitaa اول؛ Telegram/WhatsApp فقط با دسترسی کلینیک؛ SMS.ir موج ۲ | سند در ops/؛ ارجاع از پلی‌بوک |
| D02/D03 | `routeAfterFailure` + حلقهٔ ارسال در aftercare: preferred fail → کانال بعدی قابل‌استفاده (معمولاً kavenegar) | `packages/notify/src/router.spec.ts` جدول ورودی/خروجی؛ شکست Bale در تست → یک send روی kavenegar |
| D04 | replay: digest بدن + پنجرهٔ TTL روی `StateStore` (بدون migration؛ جدول `webhook_events` موج ۵ اگر نیاز به دوام بین‌ریستارت سخت شد) | تست: همان بدنهٔ امضاشده بار دوم `401/409` |
| D05 | `lastError` فقط کد محدود (`provider-timeout`, `adapter-not-implemented`, …) | تست منفی: متن پروایدر/شماره در ستون نمی‌نشیند |
| D06 | PROGRESS + اشاره در گیت ۵: DoD #2/#4 را از ✓ کاذب درآور | checkbox صادق |

**خارج از موج:** پیاده‌سازی Bot API بله/ایتا (موج ۲). UI ارتقا (موج ۳).

**Exit:** lint/typecheck فایل‌های تغییر یافته سبز · vitest همان لایه سبز · هیچ پیام تولیدی با stub «sent» نشود.

---

## موج ۲ — آداپتورهای واقعی ایران (P1)

**پیشنهاد:** اول Bale واقعی (بازار هدف)، بعد Eitaa. Telegram/WhatsApp پشت feature flag کلینیک بمانند تا ماتریس ایران نقض نشود. SMS.ir به‌عنوان failover دوم SMS نه جایگزینی Kavenegar.

> **بسته‌شدن موج ۲ (2026-09-23):** D07 و D08 انجام شد — آداپتورهای واقعی SMS.ir و Bale روی `HttpClientPort` + migration 0022 (بازشدن مجموعه‌ی بسته‌ی کانال) + ADR-0052. Eitaa واقعی به موج بعد سپرده شد (تنها استثنای باقی‌مانده‌ی D08) و D09 با ADR-0053 بسته شد («خارج از محدوده‌ی ایران تا تقاضای کلینیک»). Exit موج ۲ در production برقرار است: کانال پیکربندی‌شده دیگر `AdapterNotImplementedError` نمی‌دهد (Kavenegar، SMS.ir، Bale) و کانال پیکربندی‌نشده انتخاب نمی‌شود (`isConfigured`).

| آیتم | کار |
|---|---|
| D08 | Bale Bot API روی `HttpClientPort` + parseInbound + contract test |
| D07 | SMS.ir adapter + کانال در `MESSAGING_CHANNELS` فقط با ADR کوتاه اگر enum عوض شود |
| D09 | Telegram/WhatsApp واقعی **یا** ADR «خارج از محدودهٔ ایران تا تقاضای کلینیک» |

**Exit:** در production، کانال پیکربندی‌شده دیگر `AdapterNotImplementedError` نمی‌دهد؛ کانال پیکربندی‌نشده انتخاب نمی‌شود.

---

## موج ۳ — سطح کلینیک (مصرف، ارتقا، inbox، aftercare UI) (P1)

**پیشنهاد:** صفحهٔ مصرف پلن را قبل از UI aftercare بساز — بدون آن سهمیه برای owner نامرئی است و DoD #4 همچنان دروغ است.

> **بسته‌شدن موج ۳ (2026-09-23):** D10 و D11 و D14 انجام شد. D10: `GET /metering/usage` (فقط owner، سه متریک فاز ۵a با سقف موثر) + صفحه‌ی `/usage` با نوار مصرف و CTA ارتقا روی `QUOTA_EXCEEDED`. D11: متریک `messages` در `QUOTA_SPECS` (همان شمارنده/کلیدهای metering فاز ۵a) + `@Quota("messages")` روی enroll/actions؛ ورکر همچنان suppress می‌کند نه ۴۰۳ (تست integration: سقف پر → enroll ۴۰۳ یکنواخت + snapshot owner همان سقف را نشان می‌دهد). D14: با ADR-0054 بسته شد — «رسیدگی شد» بدون متن آزاد؛ composer دروغین حذف شد. D12 و D13 (UI aftercare و UI فاکتور) به‌عنوان تنها آیتم‌های باز موج ۳ باقی‌اند.

| آیتم | کار |
|---|---|
| D10 | `GET` snapshot متریک + صفحه owner + CTA ارتقا وقتی `QUOTA_EXCEEDED` |
| D11 | `@Quota("messages")` یا معادل HTTP روی مسیرهای محدود؛ ورکر همچنان suppress می‌کند نه ۴۰۳ |
| D12 | لیست/ساخت sequence و enrollment در وب (آینهٔ golden path بیماران) |
| D13 | لیست فاکتور + صدور از کاتالوگ (POS دکمه نیست؛ فاکتور هست) |
| D14 | تصمیم Q1: composer = ارسال قالب‌دار از router **یا** دکمه «رسیدگی شد» بدون متن آزاد → ADR-0054 |

**Exit:** e2e یا integration: عبور از سهمیه → ۴۰۳ + UI ارتقا رندر می‌شود. Inbox دیگر متن را می‌گیرد و دور می‌ریزد.

> **بسته‌شدن موج UI (2026-09-23) — بستن D12/D13، یعنی آخرین آیتم‌های باز موج ۳ سند:**
>
> ⚠️ نام‌گذاری: برنچ/PR این موج «wave4-ui» است اما **موج ۴ این سند نیست** — موج ۴ سند = موتور aftercare (D15–D18) که همچنان باز است. با این موج فقط «موجی که در جدول بالا با شمارهٔ ۳ لیبل خورده» کامل می‌شود؛ موج‌های ۴ و ۵ و ۶ این سند (D15–D25) دست‌نخورده‌اند و فاز ۵ هنوز کامل نیست.
>
> - **D13 (UI فاکتور، `/billing`):** `InvoiceListPage` — جدول فاکتورها با فیلتر وضعیت، صدور پیش‌فاکتور از کاتالوگ (productId → قیمت/شرح/مالیات از کاتالوگ؛ کاربر فقط تعداد/تخفیف)، اکشن‌های issue/pay/void؛ `void` فقط owner در UI (آینه‌ی `@Roles`) و با دلیل ≥۴ نویسه. بدون تغییر بک‌اند.
> - **D12 (UI aftercare، `/aftercare`):** `AftercarePage` دو پنلی — دنباله‌ها (لیست + ساخت با قیدهای zod: فعالِ بی‌گام ممنوع، `session_completed` نیازمند serviceId، انتخابگر قالب از `MESSAGE_TEMPLATES` واقعی notify) و ثبت‌نام‌ها (enroll + pause/resume/cancel). ۴۰۳ `QUOTA_EXCEEDED` → همان CTA ارتقای الگوی D10. بدون تغییر بک‌اند.
> - **seed:** نیازی به seed جدید نبود — `seedPhase5a` از قبل دنباله‌ی «پیگیری پس از PRP» (۴ گام)، ثبت‌نام سررسید و پیش‌فاکتور دو سطری را برای کلینیک A می‌سازد.
> - **تست:** ۱۰ تست UI جدید (۴ فاکتور + ۶ aftercare)؛ ۲۱۰/۲۱۰ تست وب و ۱۱۵/۱۱۵ conformance/quality سبز.
> - **آنچه با این موج بسته نمی‌شود:** D15–D25 — موج ۴ (موتور §6.2)، موج ۵ (مالی کامل + بهداشت داده: D21/D22/D23 هنوز در کد برقرارند — FK تک‌ستونی، بدون `deleted_at` روی message_log/inbound، و مسیر `aftercare/webhooks/zarinpal` هنوز سر جایش است) و موج ۶ (پورتال، عمداً معوق).
>
> **برنامهٔ موج پایانی UI (2026-09-23) — بستن D12/D13:** دو صفحهٔ مستقل، دو PR کوچک، هیچ migration ای.
>
> **PR الف — D13 UI فاکتور (`/billing`):**
> ۱. `InvoiceListPage`: جدول فاکتورها از `GET /billing/invoices` (پوشهٔ state از `INVOICE_STATES`، فیلتر state/بازهٔ زمانی، ستون‌های number/state/total/paidAmount/issuedAt) + دکمهٔ صدور پیش‌فاکتور از کاتالوگ `GET /billing/products` (InvoiceItemInput با productId — قیمت از کاتالوگ، کاربر فقط تعداد/تخفیف می‌دهد) + اکشن‌های issue/pay/void از همان endpointهای موجود.
> ۲. role-aware: اکشن‌های `void` فقط برای `useAuth().role === "owner"` (ماتریس @Roles سرور را آینه می‌کند)؛ خطای ۴۰۳ سرور همیشه محترم است.
> ۳. تست: UI spec صفحه (لیست/فیلتر/صدور) + i18n fa/en با الگوی `usage.i18n.ts`.
>
> **PR ب — D12 UI aftercare (`/aftercare`):**
> ۱. `AftercarePage`: دو پنل — دنباله‌ها (لیست `GET /aftercare/sequences` + ساخت با `AftercareSequenceCreate`؛ انتخابگر templateKey از `MESSAGE_TEMPLATES` notify، کانال از `MESSAGING_CHANNELS`، trigger=session_completed → پیکر services از `GET /services`) و ثبت‌نام‌ها (لیست `GET /aftercare/enrollments` + enroll با انتخابگر بیمار از `GET /patients` و اکشن‌های pause/resume/cancel از `AftercareEnrollmentAction`).
> ۲. حداقل یک sequence پیش‌ساخته برای دموی فاز ۵a در seed (`seed()` — keyهای template موجود را نشان می‌دهد؛ برای موج ۴ شرط «حداقل یک کلینیک sequence واقعی دارد» را هم برطرف می‌کند).
> ۳. تست: UI spec دو پنل + integration سبز موجود enroll/actions دست‌نخورده.
>
> **ترتیب:** اول PR الف (D13) چون billing فاقد `@RequireFeature` است و برای همهٔ کلینیک‌ها مفید است؛ بعد PR ب (D12). هیچ‌کدام migration ندارند — ریسک صفر روی الگوی expand→migrate→contract.

---

## موج ۴ — موتور Aftercare مطابق §6.2 (P2)

**پیشنهاد:** `offsetHours` را نگه دار (دقت ۲ساعتهٔ no-show)؛ `offset_days` را به‌صورت مشتق مستند کن نه breaking change. `condition`/`on_reply` را با zod در shared اضافه کن.

| آیتم | کار |
|---|---|
| D15 | دو enrollment از `sessions.start_at`: T−24h و T−2h با قالب `session.reminder` |
| D16 | `condition` / `on_reply` روی step؛ ورکر شاخه بزند |
| D17 | سازگاری `offsetHours` با سند (ADR اگر §6.2 عوض شود) |
| D18 | لینک توکن‌دار منقضی در قالب — امروز رندرر URL را رد می‌کند؛ باید استثنای کنترل‌شده باشد نه متن آزاد |

**Exit:** تست زمان مجازی (clock تزریقی) برای ۲۴س/۲س · پاسخ inbound مسیر `on_reply` را عوض می‌کند.

---

## موج ۵ — مالی کامل + بهداشت داده (P2)

**پیشنهاد:** POS و memberships را **با ADR به فاز ۷ بسپار** اگر موج ۳ فاکتور را پوشش داد؛ در غیر این صورت همین موج جداول را با expand→migrate→contract می‌سازد. B4/B5 را مستقل از POS انجام بده — tenant safety عقب نمی‌افتد.

| آیتم | کار |
|---|---|
| D19/D20 | جداول + API + UI **یا** ADR-00xx «C12/C14/C15 کامل = فاز ۷؛ فاز ۵ = invoice+Zarinpal» |
| D21 | composite FK `(clinic_id, id)` با expand→migrate→contract |
| D22 | `deleted_at` **یا** ADR append-only برای `message_log` / `inbound_messages` |
| D23 | حذف `POST aftercare/webhooks/zarinpal` از قرارداد پیام؛ callback پرداخت همان `billing/payment/callback` |
| D24 | integration Postgres: دو کلینیک، replay پرداخت، claim همزمان |

**Exit:** تست منفی cross-tenant روی enrollment/invoice · مسیر zarinpal پیام‌رسانی دیگر وجود ندارد.

---

## موج ۶ — Patient Portal (عمداً معوق)

طبق پلی‌بوک §5.6 و گیت: **پس از بازخورد واقعی کلینیک از Aftercare**. شروع این موج قبل از موج ۱–۳ ممنوع است.

| آیتم | کار |
|---|---|
| D25 | `apps/portal` PWA: OTP، Workbox، booking، intake، before/after · `@portal` e2e · `test/load/booking.js` |

DoD پلی‌بوک #1 و #5 اینجا زنده‌اند، نه در گیت ۵a+۵b.

---

## پیشنهاد اجرایی (ترتیب پیشنهادی من)

1. **موج ۱ همین حالا** — ارزان، جلوی دروغ گیت و replay STOP را می‌گیرد، SMS را مسیر واقعی ایران می‌کند.
2. **موج ۳ قبل از موج ۲ اگر محصول کلینیک مهم‌تر از مسنجر است** — owner باید سهمیه را ببیند. اگر ارسال چندکاناله اولویت دارد، موج ۲ را جلو بکش.
3. **موج ۴ فقط وقتی حداقل یک کلینیک sequence واقعی دارد** — در غیر این صورت `condition`/`on_reply` حدس محصول است.
4. **موج ۵ ADR را زود بنویس** حتی اگر کد ننویسی: POS/memberships یا فاز ۵اند یا ۷؛ وسط نماند.
5. **موج ۶ را باز نکن** تا aftercare روی SMS در sandbox یک چرخهٔ واقعی ببیند.

## خارج از محدودهٔ این سند

- بازگشایی گیت فاز ۵ یا فاز ۴
- کار فاز ۶ (هوش) به‌عنوان جایگزین این بدهی
- تبدیل stub به موفقیت جعلی در production (ممنوع؛ `stub-base.ts` درست است)

## Change log

| Date | Change |
|---|---|
| 2026-09-22 | ایجاد سند؛ موج ۱ انتخاب‌شده برای اجرا |
| 2026-09-22 | موج ۱ بسته شد: D01–D06 DONE؛ UI ارتقا همچنان D10 موج ۳ |
| 2026-09-23 | موج ۲ بسته شد: D07/D08 DONE (SMS.ir + Bale واقعی؛ Eitaa → موج بعد)، D09 OUT-OF-SCOPE (ADR-0053) |
| 2026-09-23 | موج ۳ (بخش P1 مصرف/سهمیه/inbox) بسته شد: D10/D11/D14 DONE؛ D12/D13 باز (UI aftercare و فاکتور) |
| 2026-09-23 | موج UI (برنچ wave4-ui — باقی‌ماندهٔ موج ۳) بسته شد: D12/D13 DONE (PR #103). موج‌های ۴/۵/۶ سند (D15–D25) همچنان بازند؛ فاز ۵ کامل نشده |

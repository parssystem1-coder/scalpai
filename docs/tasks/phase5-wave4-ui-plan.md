# Phase 5 — Wave 4 (پایانی): برنامه‌ی D12 + D13 — UI aftercare و UI فاکتور

- تاریخ: 2026-09-23
- وضعیت: برنامه — پیاده‌سازی نشده
- محدوده: **D13** (UI فاکتور) + **D12** (UI aftercare) — تنها آیتم‌های باز فاز ۵
- ریسک migration: **صفر** — همه‌ی APIها و جداول موجودند؛ این موج فقط وب است.

## چرا این ترتیب

۱. **D13 اول**: بیلینگ عمداً فاقد `@RequireFeature` است («صورتحساب قابلیت پایه است» — billing.controller.ts:37)؛ پس برای همه‌ی کلینیک‌ها مفید است و `QUOTA_EXCEEDED` هم روی آن اثری ندارد.
۲. **D12 دوم**: aftercare پشت `@RequireFeature("aftercare")` است و `@Quota("messages")` روی enroll دارد — صفحه باید ۴۰۳ سهمیه را همان‌جا با CTA ارتقای موجود (`/usage` الگوی D10) نشان دهد.
۳. تکمیل D12 شرط پیش‌نیاز موج بعدی را هم برطرف می‌کند («موج ۴ فقط وقتی حداقل یک کلینیک sequence واقعی دارد» — PHASE5-DEBT-WAVES.md:150).

## PR الف — D13: UI فاکتور

**مسیر:** `/billing` · **فایل‌ها:** `apps/web/src/pages/InvoiceListPage.tsx` + `invoice.i18n.ts` + مسیر در `App.tsx`

| قطعه | قرارداد موجود (بدون تغییر بک‌اند) |
|---|---|
| لیست | `GET /billing/invoices` با `InvoiceQuery` (state از `INVOICE_STATES`، from/to، limit/offset) — ستون‌های `invoiceColumns`: number, state, total, paidAmount, issuedAt |
| کاتالوگ | `GET /billing/products` برای انتخابگر سطر فاکتور |
| صدور | `POST /billing/invoices` با `InvoiceCreate` (items: `InvoiceItemInput` — با productId قیمت/شرح/مالیات از کاتالوگ می‌آید؛ کاربر فقط quantity/discount می‌دهد؛ محدودیت discount ≤ مبلغ سطر در zod است) |
| اکشن‌ها | `POST .../issue` · `POST .../payments` با `InvoicePayment` (پرداخت جزئی → partially_paid) · `POST .../void` با `InvoiceVoid` (reason حداقل ۴ کاراکتر) |

**نکته‌های ظریف:**
- اکشن void فقط `role === "owner"` در UI (آینه‌ی `@Roles("owner")` سرور) — از `useAuth()` (AuthContext role موجود).
- POS دکمه نیست؛ فاکتور هست (تاکید سند بدهی).
- ارقام: ریال بدون کسر (MONEY_MAX = 999_999_999_999، int).

**تست:** UI spec صفحه (لیست + فیلتر state + جریان صدور از کاتالوگ + گارد void) با الگوی `InboxPage.spec.tsx`؛ i18n fa/en با الگوی `usage.i18n.ts`.

## PR ب — D12: UI aftercare

**مسیر:** `/aftercare` · **فایل‌ها:** `apps/web/src/pages/AftercarePage.tsx` + `aftercare.i18n.ts` + مسیر در `App.tsx`

**پنل ۱ — دنباله‌ها:**
- لیست: `GET /aftercare/sequences` → `SequenceRow[]` (name, trigger, steps[], active) — بدون پوشه (آرایه‌ی مستقیم).
- ساخت: `POST /aftercare/sequences` با `AftercareSequenceCreate` — قیدهای zod را UI هم رعایت می‌کند: فعالِ بی‌گام ممنوع، `trigger=session_completed` نیازمند serviceId (پیکر services از `GET /services`).
- انتخابگر گام: `templateKey` از `MESSAGE_TEMPLATES` (packages/notify) — فقط کلیدهای شناخته‌شده: aftercare.day1/day3/week2/month1، session.reminder، invoice.issued/paid؛ کانال از `MESSAGING_CHANNELS`؛ `offsetHours` با راهنمای «فاصله از ثبت‌نام، نه از گام قبلی».

**پنل ۲ — ثبت‌نام‌ها:**
- لیست: `GET /aftercare/enrollments` (فیلتر patientId/sequenceId/state از `ENROLLMENT_STATES`) → `EnrollmentRow[]` — گیرنده قرمز/redacted است، PHI بدنه اینجا نیست.
- enroll: `POST /aftercare/enrollments` با `AftercareEnrollmentCreate` (انتخابگر بیمار از `GET /patients`، startAt اختیاری برای ثبت‌نام جلسه‌ی گذشته).
- اکشن‌ها: `POST /aftercare/enrollments/:id/actions` با `AftercareEnrollmentAction` (pause/resume/cancel، reason اختیاری ≥۴ کاراکتر).
- ۴۰۳ `QUOTA_EXCEEDED` روی enroll → همان بنر/CTA ارتقای الگوی D10.

**Seed:** یک دنباله‌ی پیش‌ساخته‌ی «مسیر مراقبت پس از جلسه» در `seed()` برای کلینیک A — دمو از روز اول معنادار + شرط موج ۴ برطرف.

**تست:** UI spec دو پنل با الگوی `InboxPage.spec.tsx`؛ تست‌های integration موجود (`aftercare.quota.integration.spec.ts`) دست‌نخورده — قرارداد API عوض نمی‌شود.

## معیار خروج موج

1. owner از `/billing` فاکتور می‌سازد، صادر می‌کند، پرداخت ثبت می‌کند — بدون curl.
2. owner از `/aftercare` دنباله می‌سازد و بیمار را ثبت‌نام می‌کند — و ۴۰۳ سهمیه را با UI ارتقا می‌بیند نه متن خام.
3. هیچ migration، هیچ تغییر قرارداد API، همه‌ی چک‌های CI سبز، ledger/PROGRESS صادقانه به‌روز.

## خارج از محدوده این موج

D15–D18 (موتور §6.2)، POS/memberships (موج ۵ یا فاز ۷)، پرینت/PDF فاکتور، صفحه‌ی جزئیات فاکتور جداگانه (در نسخه‌ی اول: expand-in-place سطرها در جدول).

# Phase 5 — Wave 4 (UI نهایی): Completion — بستن فاز ۵

- تاریخ: 2026-09-23
- شاخه: `260923-feat-phase5-wave4-ui`
- محدوده: **D13** (UI فاکتور، `/billing`) · **D12** (UI aftercare، `/aftercare`)
- ریسک migration: **صفر** — بدون هیچ migration و بدون تغییر قرارداد API؛ فقط وب.

## D13 — صفحه فاکتور (`/billing`)

| قطعه | فایل |
|---|---|
| صفحه | `apps/web/src/pages/InvoiceListPage.tsx` |
| i18n | `apps/web/src/pages/invoice.i18n.ts` (fa/en) |
| مسیر | `apps/web/src/App.tsx` → `/billing` (lazy، پشت ProtectedRoute) |
| تست | `apps/web/src/pages/InvoiceListPage.spec.tsx` (۴ تست) |

رفتار:
- جدول فاکتورها از `GET /billing/invoices` با فیلتر وضعیت (`INVOICE_STATES`)؛ ستون‌های number/state/total/paid + اکشن‌های درون‌سطری.
- صدور پیش‌فاکتور: انتخاب بیمار (`GET /patients`) + محصول کاتالوگ (`GET /billing/products?active=true`) — کلاینت فقط `productId/quantity/discount` می‌فرستد؛ قیمت/شرح/مالیات را سرور از کاتالوگ resolve می‌کند (قرارداد موجود `resolveItems`).
- اکشن‌ها: issue (روی draft)، پرداخت کامل (باقی‌مانده با `method:"cash"`)، void فقط برای `useAuth().role === "owner"` (آینه‌ی `@Roles("owner")`) و فقط با دلیل ≥۴ نویسه (`window.prompt`؛ ورودی کوتاه اصلاً درخواست نمی‌فرستد).
- خطای `QUOTA_EXCEEDED` → پیام صادقانه‌ی سهمیه (هرچند billing فیچرگیت ندارد، پیام یکنواخت است).

## D12 — صفحه aftercare (`/aftercare`)

| قطعه | فایل |
|---|---|
| صفحه | `apps/web/src/pages/AftercarePage.tsx` |
| i18n | `apps/web/src/pages/aftercare.i18n.ts` (fa/en) |
| مسیر | `apps/web/src/App.tsx` → `/aftercare` (lazy) |
| تست | `apps/web/src/pages/AftercarePage.spec.tsx` (۶ تست) |

رفتار:
- **پنل دنباله‌ها:** لیست `GET /aftercare/sequences` + فرم ساخت با یک گام اول — قیدهای zod را UI هم رعایت می‌کند: فعالِ بی‌گام ممنوع (`active = steps.length > 0`)، `trigger=session_completed` → انتخابگر service اجباری (`GET /services`)، `templateKey` از `MESSAGE_TEMPLATES` واقعی notify (۷ کلید)، کانال از کانال‌های واقعی ایران (kavenegar/smsir/bale)، راهنمای «offset از ثبت‌نام، نه از گام قبلی».
- **پنل ثبت‌نام‌ها:** لیست `GET /aftercare/enrollments` + enroll با انتخابگر بیمار/دنباله‌ی فعال + pause/resume/cancel از `POST .../actions`.
- ۴۰۳ `QUOTA_EXCEEDED` (روی enroll/actions، از موج ۳) → بنر + CTA ارتقا به `/usage` — همان الگوی D10.

## seed

نیازی به seed جدید نبود: `seedPhase5a` از قبل برای کلینیک A دنباله‌ی «پیگیری پس از PRP» (۴ گام day1/day3/week2/month1)، ثبت‌نام فعالِ سررسید و پیش‌فاکتور دو سطری می‌سازد — شرط «حداقل یک کلینیک با sequence واقعی» برای موج بعدی از قبل برقرار است.

## تایید محلی

- `npm run typecheck` سبز (۲۱/۲۱ پروژه).
- تست‌های وب: **۲۱۰/۲۱۰** سبز (۴۳ فایل) — شامل ۱۰ تست جدید.
- conformance + quality: **۱۱۵/۱۱۵** سبز.
- eslint روی همه‌ی فایل‌های جدید تمیز.

# Phase 5 — Wave 3 (بخش مصرف/سهمیه/inbox): Completion

- تاریخ: 2026-09-23
- شاخه: `260923-feat-phase5-wave3-quota-owner-ui`
- محدوده: **D10** (صفحه مصرف پلن + CTA ارتقا) · **D11** (`@Quota` روی مسیر پیام) · **D14** (تصمیم Q1 inbox)
- خارج از محدوده این PR: **D12/D13** (UI aftercare و UI فاکتور) — تنها آیتم‌های باز موج ۳

## D10 — صفحه مصرف پلن owner

| قطعه | فایل |
|---|---|
| اسکیمای قرارداد | `packages/shared/src/aftercare.ts` → `UsageReport` |
| endpoint | `apps/api/src/metering/metering.controller.ts` → `GET /metering/usage` (فقط `@Roles("owner")`) |
| سرویس | `MeteringService.snapshot` — حالا `periodStart` هم برمی‌گرداند (peekMetered جدید در metering.repo) |
| UI | `apps/web/src/pages/UsagePage.tsx` + مسیر `/usage` + `usage.i18n.ts` |

رفتار:
- سه متریک فاز ۵a (`upload_mb`، `analyses`، `messages_sent`) با سقف موثر پلن — «متر نمی‌شود» صادقانه با `limit: null` نمایش داده می‌شود (نوار صفرِ دروغین نه).
- وقتی هر سقفی پر شده باشد، بنر + CTA «ارتقای پلن» (لینک `/plans`) رندر می‌شود — DoD پلی‌بوک #4: ۴۰۳ دیگر کور نیست.

## D11 — سهمیه روی مسیر پیام

| قطعه | فایل |
|---|---|
| متریک گارد | `packages/db/src/repos/quota.repo.ts` → `QUOTA_SPECS.messages` (متریک شمارنده `messages_sent`؛ همان کلیدهای `messages_per_month`/`messages_sent` که metering.repo می‌خواند) |
| دکوریتور | `@Quota("messages")` روی `POST /aftercare/enrollments` و `POST /aftercare/enrollments/:id/actions` |
| تست integration | `apps/api/test/aftercare.quota.integration.spec.ts` (Postgres واقعی) |
| تست unit | `packages/db/src/repos/quota.spec.ts` + `peekMetered` در `metering.spec.ts` |

قرارداد حفظ‌شده:
- گارد فقط **پیش‌چک ارزان** است؛ حکم اتمیک همچنان `meterUsage` داخل تراکنش ورکر است (ADR-0041/0046).
- ورکر با سقفِ پر به‌جای ۴۰۳، پیام را `quota-exceeded` suppress می‌کند — ۴۰۳ یکنواخت فقط برای درخواست‌های انسانی است (بند دوم D11).
- متریک/کلیدهای گارد و شمارنده در دو فایل جدا تکرار شده‌اند و تست unit این هم‌سانی را قفل می‌کند.

## D14 — تصمیم Q1 (ADR-0054)

- **تصمیم:** دکمه‌ی «رسیدگی شد» بدون متن آزاد — ADR-0054.
- `MessageThread` دیگر textarea ندارد؛ متنِ دروغینی که endpoint ارسال نداشت و دور ریخته می‌شد حذف شد.
- `InboxPage.markHandled`: همان `PATCH /aftercare/inbox/:id` با `{state:"replied"}`؛ rollback در خطا حفظ شد.
- تست UI: composer نبودن + برچسب صادق + فراخوانی PATCH با بدنه‌ی درست.

## Exit موج ۳ (بخش اجراشده)

- integration روی Postgres واقعی: سقف override شده به ۱ → enroll دوم ۴۰۳ `QUOTA_EXCEEDED`؛ `GET /metering/usage` همان used/limit را نشان می‌دهد (همان چیزی که UI ارتقا را رندر می‌کند).
- lint/typecheck فایل‌های تغییر یافته سبز؛ تست‌های لایه سبز.
- Inbox دیگر متن را نمی‌گیرد که دور بریزد.

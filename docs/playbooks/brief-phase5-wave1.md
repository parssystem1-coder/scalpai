# Phase 5 Wave 1 Brief — صداقت گیت + رساندن پیام در ایران

> پیش‌نیاز: گیت ۵a+۵b PASS (`docs/gates/GATE_REVIEW_phase-5-2026-09-15.md`) — حکم برای API سر جایش است؛ این موج گیت را بازنمی‌کند.
> مرجع بدهی: `docs/reviews/PHASE5-DEBT-WAVES.md` موج ۱ (D01–D06)
> کادنس: یک slice · بعد از آن STOP & REPORT

## §0 — Scope قفل‌شده

فقط D01–D06. ساخت چیز دیگر = انحراف.

خارج از اسکوب (صریحاً): Bot API بله/ایتا (موج ۲) · SMS.ir (موج ۲) · UI مصرف/ارتقا (موج ۳) · Portal 5.6 (موج ۶) · جدول `webhook_events` (موج ۵).

## Slice W1 — صداقت گیت + SMS-first عملیاتی

- **صاحب:** `packages/notify` + `apps/api` aftercare/webhook + `packages/db` messaging.repo + `ops/`
- **tenant:** webhook پس از HMAC با `webhook_providers.clinic_id`؛ aftercare همان `TenantScope`
- **نقش/فیچر:** بدون endpoint تازه
- **تراکنش:** ارسال بیرون از TX می‌ماند؛ failover همان tick، بدون TX روی شبکه
- **idempotency:** همان `enrollment:step`؛ ردیف `queued`/`failed` دوباره ارسال می‌شود نه «already-sent»
- **ADR:** ندارد (انحراف از DESIGN-V2 نیست)

| ID | کار |
|---|---|
| D01 | `ops/iran-messaging-matrix.md` + ارجاع پلی‌بوک |
| D02/D03 | `routeAfterFailure` + `sendWithChannelFailover`؛ Bale fail → یک send روی kavenegar |
| D04 | replay: digest بدن + TTL روی `StateStore.hit` (بدون migration) |
| D05 | `lastError` فقط کد محدود؛ تست منفی PHI |
| D06 | PROGRESS + تصحیح گیت ۵: DoD #2/#4 صادق |

**Exit:** lint/typecheck فایل‌های تغییر یافته سبز · vitest همان لایه سبز · هیچ adapter stub در production `accepted` برنگرداند.

**⛔ STOP & REPORT**

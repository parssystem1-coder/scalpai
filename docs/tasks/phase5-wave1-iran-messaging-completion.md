# گزارش تکمیل موج ۱ فاز ۵ — صداقت گیت + SMS-first

- شاخه: `260922-feat-phase5-wave1-iran-messaging`
- تاریخ: 2026-09-22
- مرجع: `docs/reviews/PHASE5-DEBT-WAVES.md` · `docs/playbooks/brief-phase5-wave1.md`

## چه چیزی عوض شد

### D01 — ماتریس ایران
- `ops/iran-messaging-matrix.md`: SMS/Kavenegar اجباری؛ Bale/Eitaa stub تا موج ۲؛ Telegram/WhatsApp فقط با دسترسی کلینیک؛ SMS.ir موج ۲.
- ارجاع از پلی‌بوک §5.2 و `ops/README.md`.

### D02/D03 — failover همان tick
- `DEFAULT_CHANNEL_ORDER` SMS-first.
- `routeAfterFailure` + `sendWithChannelFailover` در `packages/notify`.
- aftercare گام ۲ از failover استفاده می‌کند؛ شکست Bale در همان tick یک send روی kavenegar است.
- تست قرارداد: `packages/notify/src/router.spec.ts`.

### D04 — replay وب‌هوک
- پس از HMAC، digest بدن + `StateStore.hit` با TTL ۱۰ دقیقه.
- درخواست دوم همان بدنهٔ امضاشده: `409 CONFLICT`.
- جدول `webhook_events` عمداً موج ۵.

### D05 — lastError بسته
- `MESSAGE_ERROR_CODES` + `sanitizeMessageError` در `packages/shared`.
- `markMessageFailed` فقط کد محدود می‌نویسد.
- تست منفی: متن پروایدر/شماره در ستون نمی‌نشیند.

### D06 — صداقت اسناد
- PROGRESS: چهار stub نه پنج؛ UI ارتقا تیک نخورده.
- گیت ۱۵ سپتامبر: DoD #2 با شواهد موج ۱؛ DoD #4 UI = ✗ (موج ۳).

## تأیید

```bash
npx vitest run packages/notify/src/router.spec.ts packages/shared/src/aftercare-error.spec.ts packages/db/src/repos/messaging.spec.ts apps/api/src/aftercare/inbound.controller.spec.ts
```

## خارج از موج

Bot API بله/ایتا · SMS.ir · UI مصرف/ارتقا · Portal 5.6 · جدول webhook_events.

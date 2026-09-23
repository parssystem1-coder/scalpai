# گزارش تکمیل موج ۲ فاز ۵ — آداپتورهای واقعی ایران

- شاخه: `260923-feat-phase5-wave2-real-adapters`
- تاریخ: 2026-09-23
- مرجع: `docs/reviews/PHASE5-DEBT-WAVES.md` (موج ۲) · `docs/adr/ADR-0052-smsir-channel-failover.md` · `docs/adr/ADR-0053-telegram-whatsapp-out-of-scope.md`

## چه چیزی عوض شد

### D07 — آداپتور واقعی SMS.ir (کانال ششم)
- `packages/notify/src/adapters/smsir.adapter.ts`: REST `POST https://api.sms.ir/v1/send/verify` با `SMSIR_API_KEY`/`SMSIR_SENDER`، HTTP پشت `HttpClientPort` (الگوی کاوه‌نگار)، timeout ۱۰ ثانیه با `AbortController`.
- کدهای payload → مجموعه‌ی بسته‌ی `MESSAGE_ERROR_CODES`؛ اول حکم transport بعد بدنه (درس کاوه‌نگار: ۵۰۰ با `status:1` قبول نمی‌شود).
- `supportsInbound: false`، `requiresOptIn: false`، `maxBodyChars: 480` — پیامک یک‌طرفه بدون opt-in.
- `packages/shared/src/aftercare.ts`: `MESSAGING_CHANNELS` شش‌تایی شد (`smsir` بعد از kavenegar).
- migration `0022__phase5_wave2_smsir_channel.sql` + rollback: بازشدن سه محل قفل enum در 0017 (تابع `fn_aftercare_steps_validate` + دو CHECK) با اثبات زنده‌ی CONTRACT؛ عمداً بدون seed ردیف `webhook_providers` (وب‌هوک ورودی SMS.ir سیم‌کشی نشده؛ ستون واقعی آن هم `webhook_secret` است).
- `DEFAULT_CHANNEL_ORDER`: Kavenegar → SMS.ir → مسنجرها. SMS.ir جایگزین نیست؛ حلقه‌ی دوم SMS است.

### D08 — آداپتور واقعی Bale (Bot API)
- `packages/notify/src/adapters/bale.adapter.ts`: `POST https://tapi.bale.ai/bot<token>/sendMessage` روی `HttpClientPort`؛ `requiresOptIn: true` می‌ماند (ربات تا start زدن کاربر نمی‌تواند پیام بدهد).
- ۴۰۳ → `blocked-receptor`، ۴۲۹/`retry_after` → `rate-limited` (retryable)، `ok:true` بدون `message_id` → `invalid-provider-response` (تأیید مبهم).
- `parseInbound` همان شکل تلگرام: `message.chat.id` / `message.text`.
- Eitaa عمداً stub می‌ماند — تنها استثنای بازِ D08، برای موج بعد (مسیر رسمی ارسال خودکار محدود است و عجله‌ی محصولی ندارد).

### D09 — Telegram/WhatsApp
- `docs/adr/ADR-0053-telegram-whatsapp-out-of-scope.md`: خارج از محدوده‌ی ایران تا تقاضای کلینیک؛ stub و fail-closed می‌مانند؛ حساب سراسری نگه داشته نمی‌شود.

### تست قرارداد
- `packages/notify/src/adapters/bale.spec.ts` و `smsir.spec.ts`: همان جدول قرارداد کاوه‌نگار — فرم ارسالی، mapping خطا، اولویت وضعیت HTTP بر بدنه، PHI-safe (متن/شماره‌ی پروایدر هرگز از مرز بیرون نمی‌آید)، عدم فراخوانی HTTP بدون credential.

### اسناد و env
- `.env.example`: `SMSIR_API_KEY`/`SMSIR_SENDER`، `BALE_BOT_TOKEN`، `EITAA_TOKEN`.
- `ops/iran-messaging-matrix.md`: وضعیت جدید کانال‌ها (SMS.ir واقعی، Bale واقعی، Telegram/WhatsApp ADR خارج‌از‌محدوده).
- `docs/reviews/PHASE5-DEBT-WAVES.md`: D07/D08 DONE، D09 OUT-OF-SCOPE + بند بسته‌شدن موج ۲.

## تأیید

```bash
npx vitest run packages/notify/src/adapters/smsir.spec.ts packages/notify/src/adapters/bale.spec.ts packages/notify/src/router.spec.ts packages/notify/src/adapters/kavenegar.spec.ts packages/shared/src/aftercare-error.spec.ts
npm run typecheck
```

## خارج از موج

Eitaa واقعی (تنها استثنای باقی‌مانده‌ی D08) · وب‌هوک ورودی SMS.ir · UI مصرف/ارتقا (موج ۳) · جدول `webhook_events`.

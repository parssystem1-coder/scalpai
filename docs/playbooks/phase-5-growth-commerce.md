# فاز 5 — رشد تجاری (بعد 5a: Aftercare-first → بعد 5b: Patient Portal)

> زمان: ماه ۵-۷ · پیش‌نیاز: DoD فاز 4 · ⛔ Gate: فیچر Tier-B هنوز ممنوع
> **ترتیب اجرا:** 5.1→5.5 ابتدا؛ **5.6 (Patient Portal) پس از بازخورد واقعی کلینیک‌ها از Aftercare** شروع شود.

## مرجع سند
DESIGN-V2 §6.2 · §9.1 · §13 (PHI-safe messaging) · §18 Tier-A · ADR-12/13/14

## تسک‌ها

### 5.1 Aftercare Engine (A14)
- aftercare_sequences (توالی JSON: offset_days/channel/template/condition/on_reply)
- Scheduler worker: enrollment → صف پیام زمان‌دار (زمان مجازی برای تست)
- یادآور no-show (۲۴س و ۲س قبل) + recall دوره‌ای

### 5.2 Messaging Gateway (packages/notify)
- Interface واحد + adapter ها به ترتیب: Kavenegar/SMS.ir ← Bale ← Eitaa ← Telegram ← WhatsApp Cloud API
- ماتریس «کانال‌های قابل‌اجرا داخل ایران» در ops/ مستند شود — SMS/Bale/Eitaa اول؛ Telegram/WhatsApp فقط با دسترسی خودِ کلینیک
- قالب‌های SMS خدماتی: static و عمومی (متغیر فقط نام/تاریخ/لینک) — سازگار با pre-approval اپراتور
- fallback زنجیره‌ای خودکار + retry با backoff + message_log کامل
- PHI-safe template engine: فقط متن عمومی + لینک توکن‌دار منقضی‌شونده

### 5.3 Inbound Inbox
- Webhook دریافت پاسخ‌ها + inbound_messages + صفحه inbox کلینیک (بدون AI — AI فاز 7)

### 5.4 Billing پایه
- invoices + invoice_items رابطه‌ای (§6.3) + POS ساده + memberships
- Payment adapter (زرین‌پال اول) + webhook تأیید

### 5.5 Metering کامل
- usage_counters: storage_mb/analyses/messages توسط worker ها
- QuotaGuard فعال روی همه endpoint های محدود + صفحه «مصرف پلن» برای owner

### 5.6 Patient Portal (apps/portal — PWA) — پس از بازخورد 5.1–5.5
- OTP auth (rate-limit سخت، scope=patient) + Workbox service worker
- رزرو آنلاین: انتخاب سرویس/کارمند/اسلات آزاد (Booking Engine: تداخل+buffer+سیاست لغو)
- فرم پیش‌ازمراجعه (intake_forms) قبل تأیید نوبت
- نمای بیمار: نوبت‌ها + before/after slider تصاویر خودش

## Definition of Done
```powershell
pnpm e2e --grep "@portal"; pnpm k6 run test/load/booking.js
```
- [ ] رزرو E2E از موبایل واقعی: OTP→فرم→نوبت→یادآور SMS دریافتی (sandbox)
- [ ] قطع adapter Bale → خودکار ارسال SMS fallback (تست contract)
- [ ] هیچ PHI در message_log/body نیست (تست متا روی قالب‌ها)
- [ ] عبور از quota → 403 با code=QUOTA_EXCEEDED و UI راهنمای ارتقا
- [ ] k6: 200 booking همزمان بدون double-booking یک اسلات

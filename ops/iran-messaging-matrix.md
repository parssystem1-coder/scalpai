# OPERATIONS: Iran messaging channels — which carriers can actually deliver, and the fail-closed rules around them

# ماتریس کانال‌های پیام‌رسانی قابل‌اجرا داخل ایران

> مرجع پلی‌بوک: `docs/playbooks/phase-5-growth-commerce.md` §5.2
> موج بدهی: `docs/reviews/PHASE5-DEBT-WAVES.md` D01 (موج ۱)

این سند تصمیم عملیاتی است، نه فهرست بازاریابی. «قابل‌اجرا» یعنی کلینیک ایرانی بدون فیلترشکن و بدون حساب خارجیِ اجباری می‌تواند پیام بفرستد.

## ترتیب اولویت (موج ۱)

| اولویت | کانال | وضعیت در ریپو | داخل ایران | شرط فعال‌سازی |
|---|---|---|---|---|
| 1 | SMS — Kavenegar | adapter واقعی | بله | `KAVENEGAR_API_KEY` + `KAVENEGAR_SENDER` |
| 2 | Bale | stub، در production fail-closed | بله | موج ۲ — `BALE_BOT_TOKEN` به‌تنهایی ارسال نمی‌کند |
| 3 | Eitaa | stub، در production fail-closed | بله | موج ۲ — `EITAA_TOKEN` |
| — | SMS.ir | نیست | بله | موج ۲ — failover دوم SMS، نه جایگزین Kavenegar |
| 4 | Telegram | stub، fail-closed | فقط با دسترسی خودِ کلینیک | موج ۲ + feature flag کلینیک |
| 5 | WhatsApp Cloud | stub، fail-closed | فقط با دسترسی خودِ کلینیک (Meta) | موج ۲ + feature flag کلینیک |

Kavenegar تنها کانال تولیدی **اجباری** موج ۱ است. مسنجر پیکربندی‌شده اگر هنوز stub باشد انتخاب می‌شود، ارسال را رد می‌کند، و **همان tick** به SMS می‌افتد — defer خاموش ممنوع است.

## قواعد fail-closed

- در `NODE_ENV=production` هیچ stubای `outcome: accepted` برنمی‌گرداند (`AdapterNotImplementedError`).
- کانال بدون env انتخاب نمی‌شود (`isConfigured`).
- Telegram/WhatsApp بدون توکن خودِ کلینیک در ماتریس ایران «قابل‌اجرا» نیستند؛ ScalpAI حساب سراسری برایشان نگه نمی‌دارد.
- قالب SMS خدماتی: متن عمومی + متغیر نام کلینیک/تاریخ/لینک توکن‌دار — سازگار با pre-approval اپراتور (DESIGN-V2 §13).

## Fallback

ترجیح گام دنباله اول است. شکست **ارسال** (نه فقط «پیکربندی نیست») زنجیره را همان tick جلو می‌برد. ترتیب پیش‌فرض کد: Kavenegar سپس مسنجرها. جزئیات: `routeAfterFailure` در `packages/notify`.

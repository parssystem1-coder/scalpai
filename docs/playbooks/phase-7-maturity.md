# فاز 7 — بلوغ (AI لایه‌ای + تجاری کامل + Open API)

> زمان: سال ۲ · پیش‌نیاز: DoD فاز 6 · 🔓 Gate Tier-B باز می‌شود

## مرجع سند
DESIGN-V2 §18 Tier B/C/D · §10.5 (فازهای C/D مدل) · ADR-11/12

## تسک‌ها

### 7.1 مدل‌های بعدی
- Segmentation پوست سر/مو (U-Net/SAM-tuned، معیار Dice>0.85)
- طبقه‌بندی Norwood + تشدید خودکار (agreement ≥80%)
- کاهش نقش providerهای ابری (ADR-18) به تولید متن اختیاری؛ حذف کامل در صورت رسیدن متریک‌ها

### 7.2 AI Scribe آفلاین (B7)
- whisper.cpp native-first در Electron (main process) — WASM فقط fallback سبک · مدل fine-tuned فارسی · ضبط opt-in صریح
- گفتار→SOAP ساختاریافته با قالب کلینیک → ویرایش متخصص → ذخیره session.notes
- صوت هرگز ذخیره/ارسال نمی‌شود (الزام §13)

### 7.3 Copilot داده‌کلینیک (B9)
- RAG روی pgvector (نتایج تحلیل+نوت‌ها+پرونده) با scope tenant سخت‌گیرانه
- مثال: «بیماران این ماه با قرمزی شدید؟» — پاسخ فقط از داده همان clinic

### 7.4 ربات پذیرش پیام‌رسان (B8) + تشخیص نگرانی (B11)
- Bot روی Bale/Eitaa/Telegram با همان Booking Engine
- inbound_messages.concern: دسته‌بندی نگرانی + پیش‌نویس پاسخ برای تأیید انسانی

### 7.5 تجاری کامل
- عضویت/پکیج پیشرفته · انبار با هشدار min_stock · چندشعبه UI (schema آماده است)
- کمپین بازگشت بر اساس تاریخچه («۶ ماه از آخرین PRP»)

### 7.6 پلتفرم + سرور MCP (ADR-20 · §19 سند)
- Open API (کلید per-clinic) + Webhook ها (appointment.created, analysis.completed,...)
- سرور MCP (`/mcp` — Streamable HTTP · پروتکل pin‌شده `2026-07-28` · پیش‌فرض فعال):
  - Tool Registry واحد در packages/shared — zod schema → inputSchema خودکار
  - Tools v1 فقط-خواندنی با field-whitelist: search_patients · get_patient_summary · get_analysis(+لینک Grad-CAM) · list_low_confidence_analyses · list_today_sessions · get_revenue_summary
  - دو هویت اجباری (agent + on-behalf-of) در هر call + audit خودکار + rate-limit دوگانه
  - @RequireFeature('mcp') — owner کلینیک می‌تواند خاموش کند (ثبت تغییر وضعیت در audit)
  - Write-tools v2: schedule_appointment · submit_expert_review · enroll_aftercare (clientMutationId + تأیید انسانی)
- B9 Copilot = MCP Client روی همان Registry (نه مسیر کد جدا)
- B8 ربات پیام‌رسان = پوسته نازک MCP Client (Bale/Eitaa/Telegram)
- White-label: رنگ/لوگو/دامنه per-clinic
- ارزیابی موبایل native (wrap portal)

### 7.7 Education E3 — شخصی‌سازی کامل (§11 · پیش‌نیاز: Evolution Tracker فاز ۶)
- دوربین R3F روی bbox همان lesion بیمار (از lesion_observations فاز ۶)
- روایت صوتی فارسی per-storyboard — فایل‌های تاییدشده علمی با reviewedBy الزامی
- snapshot صحنه آموزش در گزارش PDF بیمار
- قواعد §11 برقرار بماند: دیسکلیمر دائمی · skip همیشه ممکن · reduced-motion · fallback بدون WebGL

## Definition of Done
```powershell
pnpm test; pnpm e2e --grep "@scribe"; pnpm e2e --grep "@copilot"
```
- [ ] Copilot روی query cross-tenant هیچ رکوردی برنمی‌گرداند (تست منفی بحرانی)
- [ ] Copilot داخلی و یک کلاینت MCP خارجی هر دو از همان Tool Registry پاس می‌شوند (contract-test مشترک)
- [ ] هر tool call با دو هویت (agent + on-behalf-of) در audit_log ثبت می‌شود
- [ ] خروجی tools مطابق field-whitelist است — رکورد کامل هرگز برنمی‌گردد (تست PHI)
- [ ] call بدون دو هویت یا بدون entitlement 'mcp' → رد می‌شود
- [ ] Scribe کاملاً آفلاین کار می‌کند (context offline در Playwright)
- [ ] WER مدل روی test-set فارسی داخلی ≤ آستانه مصوب قبل از انتشار (عدد در ADR ثبت شود)
- [ ] E3 برای حداقل یک storyboard با داده واقعی بیمار (bbox + روایت صوتی) پخش و در PDF ثبت می‌شود
- [ ] webhook امضاشده (HMAC) · replay رد می‌شود
- [ ] متریک مدل C/D به هدف §10.5 رسیده و Eval Gate ثبت کرده

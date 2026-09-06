---
name: scalpai-build
description: Execute ScalpAI v2 rebuild phases from docs/DESIGN-V2.md and docs/playbooks/. Use when the user says "فاز X را اجرا کن", "بعدی را بساز", "ادامه بده", "implement ScalpAI phase N", or asks what comes next in the ScalpAI v2 rebuild. Orchestrates phase playbooks with acceptance criteria (DoD) and verification commands. Use ONLY for ScalpAI v2 work — not the legacy app in src/ or electron/.
---

# ScalpAI v2 — Execution Engine

## منابع حقیقت (به همین ترتیب بخوان)

1. `docs/DESIGN-V2.md` — معماری، ERD، ADR ها (تناقض = سند برنده است؛ تغییرش فقط با ADR جدید)
2. `docs/playbooks/brief-phaseN*.md` — Brief اجرایی فاز (slices + stop-points + exit criteria) — **فرمان روز**
3. `docs/playbooks/phase-N-*.md` — پلی‌بوک مرجع فاز (تسک‌ها + DoD)
4. `docs/engineering-rules.md` — قوانین غیرقابل‌نقض کدنویسی
5. `docs/PROGRESS.md` — وضعیت پیشرفت؛ پس از هر slice آپدیت کن

## پروتکل اجرای یک فاز — کادنس Slice-based

### 0. قفل فاز
ورود به فاز N+1 فقط با GATE_REVIEW PASS فاز N. هیچ کار «جلوتر» ممنوع حتی اگر وسوسه‌کننده بود.

### 1. Brief قبل از هر چیز
ابتدای فاز (یا ادامه فاز نیمه‌کاره) یک `docs/playbooks/brief-phaseN-<topic>.md` بساز/به‌روز کن، فرمت Nexora:
- §0 scope قفل‌شده («ساخت چیز دیگر = انحراف») · §1..k slices عمودی به ترتیب · بعد از هر slice: **STOP & REPORT** · §آخر Exit criteria تست‌محور (همه با CI اثبات)
- هر slice باید در یک session قابل اتمام باشد؛ بزرگ‌تر بود = قبل از شروع بشکند (Time-box rule)

### 2. کادرس اجرا — برای هر slice دقیقاً این چرخه:
```
checklist pre-change (§12 قوانین) → شاخه feat/phaseN-* → پیاده‌سازی
→ mini-DoD: کد + تست همان لایه + typecheck/lint/test/build/conformance/graph سبز
→ push → یادداشت completion در docs/tasks/phaseN-taskK-completion.md
→ گزارش کوتاه به کاربر → ⛔ STOP — تا ack کاربر، slice بعدی شروع نمی‌شود
```
- قرارداد جدید فقط در packages/shared و packages/db
- کد بدون تست merge نمی‌شود

### 3. Golden Path
ساختار مرجع = slice بیماران (`apps/api/src/core.controller.ts` + repos + integration spec). هر فیچر جدید عین آن را mirror کند؛ عدم امکان → توقف و مستندسازی mismatch، نه ساختار دوم.

### 4. پایان فاز: گیت اجباری
کل DoD/Brief سبز توسط سازنده فقط «آماده گیت» است. کاربر را به «گیت فاز N را بگیر» هدایت کن (`scalpai-gate`). پس از FAIL: رفع blocking items و گیت مجدد از صفر.

### 5. گزارش پایانی session
ساخته‌شده‌ها · انحرافات (→ ADR) · نتیجه گیت · وضعیت PROGRESS.md · گام بعدی دقیق.

## قوانین سخت (خلاصه — متن کامل engineering-rules.md الزامی است)

- Tenant safety: هر query دارای `clinic_id`؛ تراکنش‌ها با `SET LOCAL app.clinic_id`
- PHI در log/پیام ممنوع · secrets فقط env · EXIF strip اجباری روی آپلود
- Migration همیشه backward-compatible (expand→migrate→contract)
- Gate محصول: هیچ فیچر Tier-B (سند §18) قبل از پایان فاز ۵ شروع نمی‌شود
- Entitlement: endpoint محدودشده بدون `@RequireFeature` یا چک سهمیه ممنوع
- **گیت پایان فاز اجباری:** هیچ فازی بدون GATE_REVIEW با حکم PASS از ممیز مستقل «تمام» نیست — self-declare ممنوع

## گیت — قاعده اجباری قبل از هر کامیت (خودکار)

- پیش از اولین `git add` در هر محیط (init جدید یا clone تازه)، وجود `.gitignore` با این الگوها بررسی شود؛ نبود = ابتدا ساخته شود، سپس کامیت مجاز است:

```gitignore
node_modules/
dist/
coverage/
.env*
*.log
```

- قبل از هر commit یکبار `git status --short` بازبینی شود — هیچ node_modules/build-artifact/env/log ای stage نباشد
- فایل حساس (کلید/توکن/دامپ) که خارج از الگوهای بالا دیدی: کامیت لغو، فایل به `.gitignore` اضافه، سپس ادامه

## نکته محیطی

- سیستم توسعه: Windows / PowerShell — اسکریپت‌ها کراس‌پلتفرم باشند
- pnpm فقط؛ وجود همزمان دو lockfile ممنوع

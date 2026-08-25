---
name: scalpai-build
description: Execute ScalpAI v2 rebuild phases from docs/DESIGN-V2.md and docs/playbooks/. Use when the user says "فاز X را اجرا کن", "بعدی را بساز", "ادامه بده", "implement ScalpAI phase N", or asks what comes next in the ScalpAI v2 rebuild. Orchestrates phase playbooks with acceptance criteria (DoD) and verification commands. Use ONLY for ScalpAI v2 work — not the legacy app in src/ or electron/.
---

# ScalpAI v2 — Execution Engine

## منابع حقیقت (به همین ترتیب بخوان)

1. `docs/DESIGN-V2.md` — معماری، ERD، ADR ها (تناقض = سند برنده است؛ تغییرش فقط با ADR جدید)
2. `docs/playbooks/phase-N-*.md` — پلی‌بوک اجرایی فاز موردنظر (تسک‌ها + DoD)
3. `docs/engineering-rules.md` — قوانین غیرقابل‌نقض کدنویسی
4. `docs/PROGRESS.md` — وضعیت پیشرفت؛ پس از هر فاز آپدیت کن

## پروتکل اجرای یک فاز

1. پلی‌بوک فاز را کامل بخوان + بخش‌های ارجاع‌شده از DESIGN-V2.md
2. پیش‌نیاز: DoD فاز قبلی باید پاس باشد (دستورات verify در پلی‌بوک قبلی)
3. تسک‌ها به ترتیب اجرا شوند:
   - هر تسک = شاخه `feat/phaseN-*` + commit کوچک conventional (`feat(api): ...`)
   - قرارداد جدید (zod schema / API shape / DB column) فقط در `packages/shared` و `packages/db`
   - هر تسک با تست خودش بسته شود؛ کد بدون تست merge نمی‌شود
4. پایان فاز: کل DoD پلی‌بوک را اجرا کن — **فقط پاس کامل = تمام‌شده**
5. گزارش به کاربر: ساخته‌شده‌ها · انحراف از سند (→ ADR پیشنهادی) · گام بعدی
6. `docs/PROGRESS.md` آپدیت شود (✓ تسک‌های انجام‌شده)

## قوانین سخت (خلاصه — متن کامل engineering-rules.md الزامی است)

- Tenant safety: هر query دارای `clinic_id`؛ تراکنش‌ها با `SET LOCAL app.clinic_id`
- PHI در log/پیام ممنوع · secrets فقط env · EXIF strip اجباری روی آپلود
- Migration همیشه backward-compatible (expand→migrate→contract)
- Gate محصول: هیچ فیچر Tier-B (سند §18) قبل از پایان فاز ۵ شروع نمی‌شود
- Entitlement: endpoint محدودشده بدون `@RequireFeature` یا چک سهمیه ممنوع

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

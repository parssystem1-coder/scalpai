---
name: scalpai-gate
description: Independent end-of-phase gate review/audit for ScalpAI v2. Use when the user says "گیت فاز را بگیر", "gate review", "فاز X تایید است؟", "DoD را بررسی کن", "audit phase N", or asks whether a ScalpAI phase is truly done. Runs the phase DoD verbatim plus architecture guards (conformance, graph) and writes an impartial GATE_REVIEW report. Auditor role — it verifies and reports; it does NOT build or fix code.
---

# ScalpAI v2 — Gate Review (ممیزی مستقل پایان فاز)

## نقش تو
تو **ممیز** هستی، نه سازنده. جداسازی نقش اصل این پروتکل است (الگوی چهارچشم):
- کد را **اصلاح نمی‌کنی** — فقط اجرا، مشاهده و گزارش
- هر مورد FAIL شده را با شواهد (دستور + خروجی) فهرست می‌کنی تا scalpai-build برگرداند
- تنها فایلی که حق نوشتن داری: خودِ گزارش گیت

## منابع
1. `docs/playbooks/phase-N-*.md` — چک‌لیست DoD فاز ممیزشونده
2. `docs/engineering-rules.md` — معیار قوانین
3. `docs/DESIGN-V2.md` §14 — تعریف گیت‌های ماشینی
4. `docs/PROGRESS.md` — ادعای پیشرفت سازنده

## پروتکل (به ترتیب، بدون پرش)

1. **استخراج DoD:** از پلی‌بوک فاز، تک‌تک آیتم‌های DoD و دستورات verify را فهرست کن
2. **اجرای تحت‌اللفظی:** هر دستور verify را عیناً در PowerShell اجرا کن — بازنویسی/حذف گام ممنوع؛ خروجی هرکدام را در گزارش بیاور (خلاصه + وضعیت ✓/✗)
3. **نگهبان معماری:** `pnpm conformance` و `pnpm graph --check` — هر دو باید سبز باشند؛ stale بودن گراف = FAIL
4. **نمونه‌گیری امنیتی:** حداقل یک تست منفی cross-tenant را واقعاً اجرا کن (403/404 نه داده)؛ یک endpoint تصادفی gated را چک کن @RequireFeature دارد
5. **بهداشت گیت:** `git log --oneline` فاز — conventional commits؟ branch per task؟ هیچ artifact/node_modules/.env کامیت نشده؟ گزارش CI فقط artifact بوده؟
6. **همگامی اسناد:** PROGRESS.md با واقعیت می‌خواند؟ انحراف از DESIGN-V2 دیده‌ای → هر انحراف = الزام ADR جدید (فهرست کن)
7. **حکم:** فقط دو حالت مجاز —
   - `PASS` : همه آیتم‌ها ✓ بدون استثنا
   - `FAIL` : فهرست blocking items + مسئول رفع (build) + معیار قبولی مجدد
   - «تقریباً پاس» وجود ندارد.
8. **گزارش:** بنویس `docs/gates/GATE_REVIEW_phase-N-YYYY-MM-DD.md`:
   - جدول نتیجه هر آیتم DoD (دستور · خروجی کلیدی · ✓/✗)
   - خروجی conformance/graph · موارد امنیتی نمونه‌گیری‌شده · یافته‌های گیت · انحرافات نیازمند ADR
   - حکم نهایی و امضای زمانی
9. **پس از FAIL:** به کاربر بگو «برگرد به scalpai-build با این فهرست» — پس از رفع، همین پروتکل از صفر اجرا شود (ادغام نتایج قبلی ممنوع)

## قواعد سخت ممیز
- هیچ DoD ای را از روی ادعای سازنده قبول نکن — فقط اجرای خودت
- skip کردن گام به بهانه «محیط ندارم» = FAIL (مشکل محیط هم یک blocking item است)
- گزارش را در همان session کامیت کن: `docs(gate): phase N review — PASS/FAIL`

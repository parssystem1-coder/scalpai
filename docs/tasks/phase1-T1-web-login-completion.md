# Phase 1 · Slice T1 — web/login · Completion

- **Date:** 2026-08-25
- **Commit:** `4900748` (main, CI success)
- **State:** T1 complete. T2..T5 not started.

## انجام‌شده
- شل Vite+React در `apps/web` (RTL، lang=fa) با i18next fa/en پایه
- صفحه Login: react-hook-form + zodResolver از قرارداد `packages/shared` (`LoginRequest`)
- کلاینت API با **token فقط در حافظه** (بدون localStorage) + نمایش خطای canonical
- HomePage placeholder + logout (پاک‌سازی token)
- تست render با jsdom (۲ مورد)

## mini-DoD
| گام | نتیجه |
|---|---|
| typecheck / build / lint | 14/14 · exit0 |
| tests | **14 passed / 14** |
| conformance | PASS (6 rules) |
| graph --check | سبز (بعد از ثبت workspace جدید — نگهبان یک‌بار stale گرفت و اصلاح شد) |
| push main + CI ابری | success |

## یادداشت صادقانه فرآیندی
ترتیب را یک‌بار رعایت نکردم: کامیت قبل از `graph --check` انجام شد؛ نگهبان گرفت، اصلاح شد و به main رفت. همچنین PR #4 ساخته و بسته شد چون apps/web طبق ADR-23 در لیست Gated نیست → Fast lane مستقیم.

## باقی‌مانده فاز ۱
T2 web-patients · T3 playwright @smoke · T4 coverage gate · T5 ADR-0025

# Phase 1 · Slice T2 — web/patients · Completion

- **Date:** 2026-08-25
- **Merge:** PR #5 (auto-merged) · CI روی main: success
- **State:** T2 complete. T3..T5 not started.

## انجام‌شده
- صفحه PatientsPage: لیست بیماران با TanStack Query (GET /patients?limit=50)
- فرم ایجاد بیمار: react-hook-form + zodResolver از قرارداد `PatientCreate`
- نمایش خطای canonical `[CODE] message` برای کوئری و میوتیشن
- خروج از نشست در صورت 401 میانه‌استفاده + دکمه logout
- حذف HomePage placeholder (جایگزین مستقیمPatientsPage پس از login)

## mini-DoD
| گام | نتیجه |
|---|---|
| typecheck / lint / build | 14/14 · exit0 |
| tests | **16 passed / 16** |
| conformance | PASS (6 rules) |
| graph --check | سبز |
| مسیر Gated | branch → push → PR #5 → CI سبز → auto-merge ✓ |

## یادداشت فرآیندی
دو خطای resolve مسیر import در spec توسط خودم قبل از push گرفته شد؛ قانون db-access هم تضمین می‌کند چنین helper هایی فقط داخل packages/db بمانند.

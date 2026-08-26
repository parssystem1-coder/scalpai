# Phase 2 · Gate-blocker fix — آپلود با پیشرفت صحیح · Completion

- **Date:** 2026-08-26
- **Branch/PR:** `feat/phase2-fix-upload-progress` → PR (Gated lane)
- **رفع:** بند ⛔ گزارش `GATE_REVIEW_phase-2-2026-08-26.md` (blocking #1)

## تغییرات
| آیتم | شرح |
|---|---|
| `putWithProgress` | XHR با `upload.onprogress` به‌جای fetch — درصد real-time از bytes واقعی ارسالی |
| UI پیشرفت | نوار سبز + درصد (با ارقام فارسی) در هر دو شاخه رندر گالری؛ تا landing نتیجه حذف می‌شود |
| e2e **@upload-big** | فایل واقعی **۵۰MB** (JPEG سالم + padding صفر که sharp آن را decode می‌کند) · throttle uplink ~3MB/s با CDP · ادعاها: نوار visible، پیشرفت مونوتونیک و >۵۰٪ مشاهده‌شده در میانه راه، اتمام بدون crash و رندر thumbnail |

## اجرای واقعی (شواهد ممیز بعدی)
```
[upload-big] payload 50.0MB on disk
[upload-big] progress reached 99% then completed
1 passed (2.6m)
```

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | 62/62 · typecheck/lint/build/conformance/graph سبز |
| e2e smoke + @analysis | پاس |
| e2e @upload-big (throttle CDP) | پاس — بند DoD «پیشرفت صحیح بدون crash» بسته شد |

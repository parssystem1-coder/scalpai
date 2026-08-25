# Phase 2 · Slice M5 — موتور تحلیل heuristic + صفحه نتیجه · Completion

- **Date:** 2026-08-26
- **Branch/PR:** `feat/phase2-m5-analysis-engine` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M5 · پلی‌بوک ۲ بند 2.3

## معماری
```
Browser: viewUrl(presigned) → createImageBitmap → canvas ≤1024 → ImageData
  → packages/analysis-engine (heuristic-v0, WASM-safe JS)
     redness (RGB excess) · flakeTexture (Laplacian log) · densityProxy (edge curve)
  → نمایش زمان + نمرات → POST /analyses (اعتبارسنجی zod در shared) → ذخیره
  → expert review (تأیید / اسلایدرهای اصلاح + note) → PATCH expert-review
Gold-label §10.2: reviewedBy + reviewedAt داخل expert_review jsonb + audit
```
Seam فاز ۶: `createEngine({backend})` — ONNX بدون تغییر call-site ها اضافه می‌شود.

## mini-DoD
| گام | نتیجه |
|---|---|
| unit موتور | **۶/۶** — قطعیت، تمایز قرمزی/بافت، bounds قرارداد، رد input ریز |
| integration analyses | **۴/۴** — ذخیره/خواندن · Gold-label با هویت reviewer · خطای canonical · cross-tenant ‏404 |
| `pnpm test` کل | **56 passed / 56** |
| e2e **@analysis** | ✅ آپلود UI → تحلیل → elapsed=**92ms** <۳۰۰۰ → confirm → saved |
| typecheck/lint/build/conformance/graph | سبز (graph با ۷ یال وابستگی جدید regenerate) |

## migration 0007
`analyses_type_check` حالا 'heuristic' را هم می‌پذیرد (expand-safe swap).

## پنج fail واقعی این slice (پربارترین slice از نظر یادگیری)
1. scene() تست آرگومان opts را جای w می‌فرستاد → NaN های زنجیره‌ای؛ امضا اصلاح شد.
2. rgbaToGray به Buffer وابسته بود → امضای typed-array عمومی (WASM-safe واقعی).
3. apiFetch همیشه content-type json می‌گذاشت → bodyless POST/DELETE روی Fastify ‏400.
4. **CORS پیش‌فرض fastify شامل PATCH نیست** → preflight بی‌صدا می‌مرد؛ methods صریح شد. (W24 کاندید ثبت در registry.)
5. مسابقه کلیک confirm با autosave → دکمه تا landing ذخیره disabled.

## یادداشت
- elapsed اندازه‌گیری سمت کلاینت روی دستگاه توسعه است؛ پروکسی معیار «مرجع mid-range» — سنجه‌ی رسمی در gیت با همین assert اعمال می‌شود.
- GET /analyses لیست هم اضافه شد (برای تاریخچه صفحه بیمار در فاز ۴).

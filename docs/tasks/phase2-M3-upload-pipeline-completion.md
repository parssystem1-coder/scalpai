# Phase 2 · Slice M3 — خط لوله آپلود (Media service) · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase2-m3-upload-pipeline` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M3 · پلی‌بوک ۲ بند 2.1

## جریان پیاده‌شده
```
POST /patients/:pid/gallery/init   → اعتبارسنجی mime/size(≤50MB) + ردیف pending + presigned PUT (کلید clinic-{id}/gallery/{uuid}/original.ext)
Client PUT (مستقیم به MinIO)
POST /gallery/:gid/complete        → دانلود یک‌باره سمت سرور →
  ۱) magic-byte sniff (نوع اعلامی ≠ محتوا ⇒ INVALID_IMAGE + پاک‌سازی)
  ۲) sharp: auto-orient با EXIF → حذف متادیتا در re-encode → سقف 2048px
  ۳) quality-gate ‏(M2) قبل از نگه‌داشتن هرچیز ⇒ QUALITY_FAIL با دلایل فارسی
  ۴) thumbnail ‏512px + canonical jpeg q85 + sha256 → state=done + audit
هر reject: حذف object + حذف ردیف pending + audit ردیف reject_*
```

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | **43 passed / 43** — شامل: healthy→done با metrics/thumb/sha256 · fake-jpeg → INVALID_IMAGE+cleanup · تار → QUALITY_FAIL «تار» · cross-tenant complete → 404 · unauth init → 401 · magic-bytes unit ×۲ |
| typecheck / lint / build / conformance / graph | سبز (گراف بعد از endpoint های جدید regenerate شد) |
| coverage | lines=**84.94%** |

## سه fail واقعی در راه سبز شدن (و درسشان)
1. **race دو suite روی یک DB** — resetAll موازی → `fileParallelism: false` در vitest؛ قاعده: هر spec که DB را reset می‌کند باید سریالی اجرا شود.
2. **تولید phone در همان millisecond** — قید partial-unique خودش را نشان داد؛ helper ‏nextPhone یکتا. (قید DB به‌عنوان آخرین خط دفاع واقعاً کار کرد.)
3. **POST پیش‌فرض NestJS = 201** — endpoint اکشنِ complete با @HttpCode(200) صریح شد تا قرارداد مبهم نماند.

## یادداشت معماری
- EXIF-strip سمت سرور انجام می‌شود (بعد از دانلود کامل) — برای فاز ۲ درست است؛ بهینه‌سازی strip سمت کلاینت قبل از PUT به فاز ۳/۴ موکول شد (ثبت در PROGRESS فاز ۳).
- storageKey در DB از این پس **rest-key** است (بدون پیشوند clinic) — همه فراخوانی‌ها prefix را خودشان می‌سازند.

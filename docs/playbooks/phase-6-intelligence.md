# فاز 6 — هوش (Flywheel + اولین مدل + 3D + Tracker)

> زمان: ماه ۶-۱۲ · پیش‌نیاز: DoD فاز 5 (یا اجرای موازی تأییدشده)

## مرجع سند
DESIGN-V2 §10 کامل · §11 E2 · §6.4 · ADR-7/16

## تسک‌ها

### 6.1 Data Lake و برچسب‌گذاری
- pipeline بی‌نام‌سازی (EXIF/crop/ID جایگزین) → training_samples
- فقط clinics با consent_training=true · silver=خروجی AI · gold=expert_review
- صف Active Learning: low-confidence اول

### 6.2 Grad-CAM (ADR-16)
- تولید heatmap در inference pipeline + ذخیره explain_map_key
- overlay در صفحه نتیجه + در بازبینی متخصص (تسریع Gold)

### 6.3 مدل ۱: فولیکول‌شمار
- دیتاست bootstrap (عمومی + pseudo-label با threshold)
- فاین‌تیون YOLO کوچک → export ONNX int8
- Eval Gate: test-set ثابت، MAE نسبت به شمارش متخصص؛ برد = release
- model_bundles + امضای Ed25519 + دانلود verify دار کلاینت + last-known-good rollback

### 6.4 Scalp Explorer 3D (E2)
- مدل آناتومیک خریداری (Draco glTF <5MB) + R3F صحنه مشترک
- cameraPath های per-condition از storyboard ها + lazy-load فقط در نمای آموزشی

### 6.5 Evolution Tracker (A5)
- lesions/lesion_observations (§6.4) · pin ضایعه روی تصویر توسط کاربر
- مقایسه بین جلسات: side-by-side + flicker + change_score

### 6.6 جستجوی تصویری اطلس (A6)
- embedding CLIP-like کوچک → image_embeddings(pgvector)
- «تصاویر مشابه» در نمای گالری/تحلیل

## Definition of Done
```powershell
pnpm test --filter analysis-core; pnpm e2e --grep "@explorer"
```
- [ ] هیچ داده بدون consent وارد Data Lake نمی‌شود (تست متا)
- [ ] باندل مدل امضانامعتبر → رد و ادامه با baseline
- [ ] Eval Gate: مدل ضعیف‌تر → status=candidate می‌ماند و منتشر نمی‌شود
- [ ] Explorer روی دستگاه بدون WebGL → fallback پیغام+Rive

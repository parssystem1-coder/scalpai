# فاز 2 — رسانه و تحلیل (گالری + Quality Gate + موتور ONNX)

> زمان: هفته ۵-۸ · پیش‌نیاز: DoD فاز 1

## مرجع سند
DESIGN-V2 §10.1 (Quality Gate) · §10.5 (baseline) · §12 (UI) · ADR-6

## تسک‌ها

### 2.1 Media service
- presigned URL آپلود مستقیم به MinIO + chunk/resume-ready API
- EXIF strip + magic-byte check + محدودیت نوع/حجم قبل accept
- thumbnail pipeline worker (چند سایز)

### 2.2 Image Quality Gate لوکال (A4)
- packages/analysis-core: امتیاز blur(Laplacian)/light(histogram)/framing
- UI capture: مردود → پیام «عکس مجدد» همان لحظه؛ نمره در gallery_items.quality

### 2.3 موتور تحلیل
- packages/analysis-engine: ONNX Runtime Web loader + مدل heuristic baseline (معادل analyze.py v1، بازنویسی TS/WASM)
- صفحه تحلیل: انتخاب تصویر→اجرا→نتیجه ساختاریافته (schema در shared) + ذخیره analyses + expert_review UI مینیمال (تأیید/اصلاح اسکور)

### 2.4 گالری کارآمد
- TanStack Query + virtualized list (TanStack Virtual) — ضدالگوی base64-v1 هرگز
- تصاویر فقط با presigned URL / thumb_key رندر می‌شوند

### 2.5 i18next کامل fa/en + Auto-lock (قفل پس از N دقیقه بی‌کاری)

## Definition of Done
```powershell
pnpm test; pnpm e2e --grep "@analysis"
```
- [ ] آپلود 50MB روی شبکه کند (throttle) بدون crash و با پیشرفت صحیح
- [ ] تصویر تار عمدی توسط quality-gate رد می‌شود (تست واحد با fixture)
- [ ] Lighthouse perf صفحه گالری ≥85 با 500 رکورد seed
- [ ] bundle اولیه <300KB gzip (budget CI پاس)
- [ ] تحلیل baseline روی لپ‌تاپ مرجع mid-range < ۳ ثانیه — WASM مسیر امن، WebGPU اختیاری؛ در Electron مسیر Node runtime مجاز

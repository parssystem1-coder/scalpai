# Phase 2 Completion Brief — رسانه و تحلیل (فرمت Nexora)

> پیش‌نیاز: گیت فاز ۱ PASS (docs/gates/GATE_REVIEW_phase-1-2026-08-25.md) ✓
> کادنس: هر slice چرخه کامل §12 قوانین؛ بعد از هر slice **STOP & REPORT** تا ack مالک.

## §0 — Scope قفل‌شده
فقط شش slice زیر از پلی‌بوک ۲ (بندهای 2.1..2.5) + دو بدهی منتقله (W16/W17/W20 از Weakness Registry). ساخت هر چیز دیگر = انحراف.
خارج از اسکوب (صریحاً): chunk-resume آفلاین واقعی (فاز ۳)، Grad-CAM/مدل YOLO (فاز ۶)، Aftercare (فاز ۵)، Electron (فاز ۴).

## Slice M1 — بستر Storage + ایندکس‌ها
- **ADR-0026:** توسعه لوکال با MinIO باینری native (`minio.exe server`) هم‌راستا با ADR-0024؛ Docker فقط CI/استقرار. env واحد `S3_ENDPOINT/S3_BUCKET/...`
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` در apps/api · StorageService: presign PUT/GET با مسیر اجباری `clinic-{clinicId}/...` و TTL کوتاه (DESIGN §7 لایه ۴)
- migration `0005__media_indexes.sql` (W20): sessions(clinic_id,start_at desc) · gallery_items(clinic_id,patient_id,created_at desc) · analyses(clinic_id,patient_id,created_at desc)
- CI: سرویس minio به workflow + env؛ integration: roundtrip presign واقعی
- mini-DoD: typecheck/lint/test/build/conformance/graph سبز

**⛔ STOP & REPORT**

## Slice M2 — Quality Gate لوکال در packages/analysis-core
- توابع خالص CV روی grayscale: blur (واریانس Laplacian) · light (میانگین هیستوگرام) · framing (اشباع لبه) + آستانه‌ها + verdict {pass|reject, reasons[] فارسی}
- unit test با fixture های synthetic (sharp: تار عمدی/تاریک/سالم) — الزام DoD پلی‌بوک «تار عمدی رد شود»
- mini-DoD همان زنجیره

**⛔ STOP & REPORT**

## Slice M3 — خط لوله آپلود (Media service)
- جریان: `POST /patients/:pid/gallery/init` (اعتبارسنجی mime/size، ساخت gallery_items pending + presigned PUT چند-بخشی) → PUT مستقیم کلاینت به MinIO → `POST /gallery/:gid/complete`: دانلود یک‌باره سمت سرور → magic-byte check → sharp: EXIF-strip + سقف رزولوشن + thumbnail → محاسبه quality (از M2)؛ مردود = حذف object + 400 با reasons؛ سالم = ذخیره canonical+thumb، state=done، sha256
- integration: آپلود سالم 201 / JPEG جعلی (magic-byte) 400 / تار 400 QUALITY_FAIL
- mini-DoD زنجیره + e2e هنوز نه (با M4)

**⛔ STOP & REPORT**

## Slice M4 — گالری کارآمد (API + وب)
- `GET /patients/:pid/gallery` cursor-paginated (فیلد live-only) + presigned view/thumb در پاسخ؛ DELETE soft
- وب: صفحه گالری بیمار — TanStack Query + TanStack Virtual، رندر فقط با thumb_key (ضدالگوی base64-v1)
- seed ۵۰۰ رکورد گالری + اثبات Lighthouse perf ≥85 (artifact) + **step جدید CI: bundle gzip <300KB**
- mini-DoD زنجیره + render test

**⛔ STOP & REPORT**

## Slice M5 — موتور تحلیل heuristic + صفحه نتیجه
- packages/analysis-engine (کلاینت، WASM-safe): grayscale→scores قطعی {redness, flakeTexture, densityProxy} + modelVersion="heuristic-v0"؛ seam تمیز برای ONX واقعی فاز ۶
- قرارداد AnalysisResult zod در shared · `POST /analyses` (ذخیره + اعتبارسنجی) · `PATCH /analyses/:id/expert_review` (تأیید/اصلاح متخصص — Gold-label seed)
- وب: انتخاب تصویر گالری → اجرا با نمایش زمان → صفحه نتیجه ساختاریافته + expert review مینیمال
- e2e `@analysis`: آپلود→تحلیل→نتیجه→review؛ assertion زمان تحلیل <۳s (پروکسی دستگاه مرجع)

**⛔ STOP & REPORT**

## Slice M6 — i18next کامل + Auto-lock + سخت‌سازی منتقله
- همه رشته‌های hardcode → resources fa/en؛ toggle زبان؛ ارقام فارسی
- Auto-lock: بی‌کاری ۱۰ دقیقه → قفل (پاک‌سازی token در حافظه + overlay ورود) + render test
- W16: @fastify/rate-limit روی /auth/login + قفل تدریجی in-memory per email/IP (Redis فاز ۵) — تست 429
- W17: fastify-helmet با CSP سازگار swagger/vite — تست presence هدرها
- mini-DoD زنجیره کامل

**⛔ STOP & REPORT**

## Exit criteria پایان فاز ۲ — همه با اجرا/CI اثبات:
1. `pnpm test` سبز شامل fixture کیفیت (تار رد شود) و roundtrip presign
2. `pnpm e2e --grep "@analysis"` سبز با assertion تحلیل <۳s
3. coverage gate ≥70% حفظ — پکیج‌های analysis-core/engine زیر پوشش
4. conformance PASS · graph --check سبز (endpoints جدید در گراف)
5. bundle gzip <300KB — step CI سبز
6. Lighthouse گالری ≥85 با seed 500 (artifact)
7. W16/W17/W20 در WEAKNESSES.md بسته شوند
8. GATE_REVIEW نهایی فاز ۲ = PASS

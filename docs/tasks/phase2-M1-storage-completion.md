# Phase 2 · Slice M1 — بستر Storage + ایندکس‌ها · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase2-m1-storage` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M1

## انجام‌شده
| آیتم | شرح |
|---|---|
| ADR-0026 | توسعه لوکال با MinIO باینری native (`%USERPROFILE%\bin\minio.exe`، داده خارج ریپو)؛ CI همان باینری linux در یک step — پاریتی کامل، صفر وابستگی به registry |
| StorageService | تنها درِ object storage: presign PUT(300s)/GET(600s)، getObject/putBuffer/removeObject، `ensureBucket` idempotent در boot؛ **key-scheme اجباری** `clinic-{clinicId}/...` (DESIGN §7 لایه ۴) |
| deps | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (forcePathStyle) |
| migration 0005 | ایندکس‌های composite ‏W20: sessions(clinic_id,start_at DESC) · gallery_items(clinic_id,patient_id,created_at DESC) · analyses(clinic_id,patient_id,created_at DESC) — applied لوکال ✓ |
| CI | استپ «Start MinIO» با healthcheck loop + env های S3 |
| تست integration جدید | `media.storage.spec.ts` (۳ مورد): قفل prefix مستأجر · roundtrip واقعی presigned PUT→GET→remove روی MinIO · جداسازی tenant داخل bucket |

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm db:migrate` | applied=1 (0005) |
| `pnpm test` | **29 passed / 29** (+۳ storage) |
| typecheck / lint / build / conformance / graph | 16/16 · 0 · 14/14 · PASS(7) · سبز |
| MinIO لوکال | health 200 روی 127.0.0.1:9000 با اعتبار env |

## یادداشت فرآیندی
- یک دور fail واقعی: امضای `getSignedUrl` در SDK نسخه فعلی آبجکت `{expiresIn}` می‌خواهد نه عدد خام — typecheck گرفت، اصلاح شد.
- MinIO باید قبل از تست‌های integration بالا باشد (مثل PG17 native) — دستور راه‌اندازی در `.env.example` ثبت شد.

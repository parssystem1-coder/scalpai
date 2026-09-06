# ADR-0026 — توسعه لوکال با MinIO باینری native؛ Docker فقط CI/استقرار

- Status: Accepted
- Date: 2026-08-25
- Phase: 2
- Blocks: Slice M1 (presign roundtrip لوکال)، M3 (آپلود)

## زمینه
فاز ۲ به Object Storage ‏S3-compatible نیاز دارد (DESIGN §3/§7). Docker Desktop روی سیستم توسعه نصب نیست (همان قید ADR-0024). MinIO باینری ویندوزی تک‌فایلی است (~113MB) و بدون نصب اجرا می‌شود.

## تصمیم
- **لوکال:** `minio.exe server <data-dir> --address 127.0.0.1:9000` با `MINIO_ROOT_USER/PASSWORD` از env؛ دانلود یک‌باره در `%USERPROFILE%\bin\minio.exe`، داده‌ها خارج ریپو (`%USERPROFILE%\minio-data`)
- **CI:** دانلود همان باینری linux-amd64 در یک step و اجرای background — پاریتی کامل با لوکال (بدون image/registry mirror)
- **استقرار:** docker-compose طبق DESIGN §2 — بازنگری این ADR هنگام انتشار
- کلاینت: `@aws-sdk/client-s3` + presigner؛ `forcePathStyle=true`؛ bucket در boot/test با CreateBucket تضمین می‌شود (نیازی به mc نیست)

## جایگزین‌های ردشده
- Adapter فایل‌سیستم برای dev: انحراف معنایی از S3 (etag/range/presign) — ریسک پاریتی
- Docker Desktop الان: همان استدلال ADR-0024

## پیامدها
- مثبت: presigned URL واقعی در تست‌های لوکال · صفر وابستگی به registry تحریمی
- منفی: سرویس باید پیش از تست‌های integration بالا باشد (مثل PG17 native) — healthcheck در spec
- قید: نسخه باینری لوکال و CI ممکن است minor فرق کند — SDK S3 API پایدار است

## تأثیر بر قوانین
- engineering-rules §2 (آپلود): مسیر اجباری `clinic-{clinicId}/...` فقط از طریق StorageService — قانون conformance آینده می‌تواند key-scheme را بگیرد

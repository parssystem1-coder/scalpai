# ADR-0024 — توسعه لوکال با PostgreSQL نصب‌شده؛ Docker فقط برای CI/استقرار

- Status: Accepted
- Date: 2026-08-25
- Phase: 0→1
- Blocks: فاز 1 (migration-from-empty لوکال، تست‌های RLS)

## زمینه
Docker Desktop روی سیستم توسعه فعلی نصب نیست (محدودیت دیسک/گرافیک)؛ PostgreSQL 17 به‌صورت native در `D:\Program Files\PostgreSQL\17` سرویسِ فعال دارد. CI ابری (GitHub runners) docker دارد و compose موجود است.

## تصمیم
- **لوکال:** اتصال مستقیم به PostgreSQL 17 نصب‌شده (`localhost:5432`) از طریق `DATABASE_URL` در `.env` (الگوی `.env.example`)
- **CI:** همان ops/dev.yml روی runner (docker) — بدون تغییر §14.2
- **Self-Hosted/انتشار:** docker-compose طبق سند — وقتی محصول بالغ شد، محیط توسعه هم مهاجرت داده می‌شود (بازنگری این ADR)

## جایگزین‌های ردشده
- نصب Docker Desktop الان — هزینه دیسک/منابع بی‌مصرف تا فاز استقرار

## پیامدها
- مثبت: شروع فوری فاز ۱ بدون پیش‌نیاز سنگین · رفتار migration روی PG واقعی لوکال
- منفی: دو مسیر اتصال (native vs container) که باید با env یکسان شوند — اسکریپت‌ها فقط متغیر می‌خوانند نه آدرس hardcode
- قید: نسخه لوکال (17) ≥ نسخه CI (pg16 در compose) — تفاوت minor قابل چشم‌پوشی؛ اگر عقب افتاد، image ارتقا می‌یابد

## تأثیر بر قوانین
skill «scalpai-migration» گام ۷: مسیر اول = native PG17؛ docker فقط برای CI.

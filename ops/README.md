# راهنمای خودمیزبانی و استقرار کلینیک (ScalpAI v2 Self-Hosted & Ops)

این راهنما شامل دستورالعمل‌های راه‌اندازی و نگهداری پکیج سرور اختصاصی و خودمیزبانی محلی کلینیک‌ها (Self-Hosted Stack) است.

---

## ۱. پیش‌نیازهای سخت‌افزاری و نرم‌افزاری سرور محلی کلینیک

- **سیستم‌عامل**: Linux (Ubuntu 22.04 LTS / Debian 12 / AlmaLinux 9) یا macOS / Windows WSL2
- **پردازنده**: حداقل ۴ هسته (توصیه: ۸ هسته)
- **رم (RAM)**: حداقل ۸ گیگابایت (توصیه: ۱۶ گیگابایت برای پایگاه داده برداری pgvector و پردازش مدیا)
- **فضای دیسک**: حداقل ۵۰ گیگابایت SSD (توصیه: ۱۰۰+ گیگابایت NVMe برای ذخیره تصاویر با وضوح بالا)
- **داکر**: Docker Engine 24.0+ و Docker Compose v2.20+

---

## ۲. سرویس‌های موجود در پکیج (`ops/prod.yml`)

| سرویس | پورت داخلی | پورت عمومی | توضیحات |
| :--- | :--- | :--- | :--- |
| **caddy** | 80, 443 | 80, 443 | پروکسی معکوس و مدیریت خودکار گواهینامه‌های SSL/TLS |
| **web** | 80 | - | فرانت‌اند PWA و داشبورد وب بالینی |
| **api** | 3000 | - | سرور NestJS Fastify با منطق کسب‌وکار، همگام‌سازی و اعتبارسنجی لایسنس |
| **worker** | - | - | پردازش ناهمگام وظایف سنگین، آنالیز و انکر هش‌های WORM |
| **postgres** | 5432 | - | پایگاه‌داده PostgreSQL 16 به همراه افزونه pgvector |
| **minio** | 9000, 9001 | - | ذخیره‌سازی شیء سازگار با S3 جهت ذخیره امن عکس‌های درماتوسکوپی |
| **redis** | 6379 | - | صف پیام و کشینگ پرسرعت |
| **backup-cron**| - | - | اجرای خودکار بکاپ دوره‌ای رمزگذاری‌شده در ساعت ۲:۰۰ بامداد |

---

## ۳. مراحل راه‌اندازی و اجرا (Quick Start)

### مرحله ۱: ایجاد فایل متغیرهای محیطی
```bash
cp ops/prod.env.template ops/prod.env
```
مقادیر کلیدهای سری، رمزهای عبور پایگاه‌داده و عبارت رمزگذاری بکاپ (`BACKUP_ENCRYPTION_PASSPHRASE`) را در فایل `ops/prod.env` ویرایش فرمایید.

### مرحله ۲: اجرای پکیج با داکر کامپوز
```bash
cd ops
docker compose -f prod.yml --env-file prod.env up -d --build
```

### مرحله ۳: بررسی سلامت سرویس‌ها
```bash
docker compose -f prod.yml ps
```

---

## ۴. مدیریت بکاپ‌گیری و بازیابی اطلاعات (Backup & Restore)

### بکاپ‌گیری دستی فوری
برای ایجاد یک نسخه پشتیبان رمزگذاری‌شده با الگوریتم **AES-256-CBC** در هر زمان:
```bash
docker compose -f ops/prod.yml exec backup-cron /scripts/backup.sh
```
فایل‌های بکاپ در دایرکتوری `/backups` ذخیره شده و نسخه‌های قدیمی‌تر از ۱۴ روز به‌طور خودکار پالایش می‌گردند.

### بازیابی اطلاعات از فایل پشتیبان
برای بازیابی از یک فایل بکاپ رمزگذاری‌شده:
```bash
docker compose -f ops/prod.yml exec -T backup-cron /scripts/restore.sh /backups/scalpai_backup_YYYYMMDD_HHMMSS.sql.gz.enc
```

---

## ۵. پیکربندی دامنه کلینیک و گواهینامه SSL در Caddy

فایل `ops/Caddyfile` به صورت پیش‌فرض تمام ترافیک وب و API را روت می‌کند. برای اتصال دامنه کلینیک یا شبکه داخلی LAN (مثلاً `https://clinic.local`):

```caddy
clinic.yourdomain.com {
    tls admin@yourclinic.com

    handle /api/* {
        uri strip_prefix /api
        reverse_proxy api:3000
    }

    handle /media/* {
        reverse_proxy minio:9000
    }

    handle {
        reverse_proxy web:80
    }
}
```
پس از تغییر، سرویس Caddy را با دستور زیر مجدداً بارگذاری کنید:
```bash
docker compose -f ops/prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

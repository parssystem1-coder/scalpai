# راهنمای خودمیزبانی و استقرار کلینیک (ScalpAI v2 Self-Hosted & Ops)

این راهنما راه‌اندازی و نگهداری استک خودمیزبان کلینیک را پوشش می‌دهد. تصمیم معماری استقرار در `docs/adr/ADR-0036-deployment-topology.md` و مرجع دستورها در `docs/ops/DEPLOYMENT.md` است.

---

## ۱. پیش‌نیازها

- **سیستم‌عامل**: Linux (Ubuntu 22.04 LTS / Debian 12 / AlmaLinux 9) یا macOS / Windows WSL2
- **پردازنده**: حداقل ۴ هسته (توصیه: ۸ هسته)
- **رم**: حداقل ۸ گیگابایت (توصیه: ۱۶ گیگابایت برای pgvector و پردازش مدیا)
- **دیسک**: حداقل ۵۰ گیگابایت SSD (توصیه: ۱۰۰+ گیگابایت NVMe)
- **داکر**: Docker Engine 24.0+ و Docker Compose v2.20+
- **دامنه**: یک نام دامنه واقعی که به IP این هاست resolve شود (برای TLS خودکار)

---

## ۲. سرویس‌های استک (`ops/prod.yml`)

| سرویس | پورت داخلی | پورت عمومی | توضیحات |
| :--- | :--- | :--- | :--- |
| **caddy** | 80, 443 | 80, 443 | پروکسی معکوس، TLS خودکار (ACME) و ریدایرکت HTTP به HTTPS |
| **web** | 80 | - | فرانت‌اند PWA (nginx استاتیک) با healthcheck روی `/health` |
| **api** | 3000 | - | NestJS/Fastify؛ healthcheck روی `/api/v1/health`، drain با SIGTERM |
| **migrate** | - | - | سرویس یک‌باره: مهاجرت‌ها با نقش owner، سپس خروج. API تا خروج موفق آن بالا نمی‌آید |
| **postgres** | 5432 | - | PostgreSQL 17 + pgvector (هم‌نسخه با CI) |
| **minio** | 9000, 9001 | - | ذخیره‌سازی سازگار با S3 برای تصاویر |
| **redis** | 6379 | - | state مشترک احراز هویت، throttle و rate limit (ADR-0034) |
| **backup-cron** | - | - | بکاپ دوره‌ای رمزگذاری‌شده، ساعت ۲:۰۰ بامداد |

سرویس `worker` حذف شد: کد ورکری وجود نداشت. کارهای پس‌زمینه در فازهای ۶ و ۹ با entrypoint واقعی برمی‌گردند (ADR-0036).

همه ایمیج‌ها با تگ مشخص pin شده‌اند و هر سرویس سقف CPU/RAM دارد.

---

## ۳. راه‌اندازی (Quick Start)

### مرحله ۱: متغیرهای محیطی

```bash
cp ops/prod.env.template ops/prod.env
```

همه مقادیر را پر کنید: `SCALPAI_DOMAIN`، `ACME_EMAIL`، پسورد owner و پسورد نقش اجرا (`APP_ROLE_PASSWORD`)، اعتبار MinIO، `JWT_SECRET` و `BACKUP_ENCRYPTION_PASSPHRASE`.

هیچ متغیری مقدار پیش‌فرض ندارد؛ اگر چیزی جا بیفتد، compose عمداً fail می‌کند. پسوردها را فقط با حرف و رقم بسازید (در URL اتصال Postgres جاسازی می‌شوند).

### مرحله ۲: اعتبارسنجی و اجرا

```bash
docker compose -f ops/prod.yml --env-file ops/prod.env config -q
docker compose -f ops/prod.yml --env-file ops/prod.env up -d --build --wait
```

### مرحله ۳: بررسی سلامت

```bash
docker compose -f ops/prod.yml --env-file ops/prod.env ps
docker compose -f ops/prod.yml --env-file ops/prod.env logs migrate
curl -fsS https://YOUR_DOMAIN/api/v1/health
```

---

## ۴. بکاپ و بازیابی

### بکاپ دستی

```bash
docker compose -f ops/prod.yml --env-file ops/prod.env exec backup-cron /scripts/backup.sh
```

فایل‌ها در `/backups` ذخیره و نسخه‌های قدیمی‌تر از ۱۴ روز پالایش می‌شوند.

### بازیابی

```bash
docker compose -f ops/prod.yml --env-file ops/prod.env exec -T backup-cron \
  /scripts/restore.sh /backups/scalpai_backup_YYYYMMDD_HHMMSS.sql.gz.enc
```

**هشدار صریح:** مسیر بکاپ فعلی فقط Postgres را می‌گیرد، رمزنگاری آن authenticated نیست و off-site/restore test ندارد. سخت‌سازی کامل بکاپ آیتم فاز ۹ است (C10). تا آن زمان به این بکاپ به‌عنوان تنها خط دفاعی تکیه نکنید.

---

## ۵. دامنه و گواهی TLS

Caddy دامنه را از `SCALPAI_DOMAIN` و ایمیل ACME را از `ACME_EMAIL` می‌خواند؛ چیزی در `ops/Caddyfile` هاردکد نیست. `auto_https` روشن است و درخواست‌های HTTP با ۳۰۱ به HTTPS می‌روند.

برای نصب LAN که ACME ممکن نیست، داخل بلاک سایت خط زیر را اضافه کنید و CA محلی Caddy را روی ایستگاه‌های کاری trust کنید:

```caddy
tls internal
```

بارگذاری مجدد پس از تغییر:

```bash
docker compose -f ops/prod.yml --env-file ops/prod.env exec caddy \
  caddy reload --config /etc/caddy/Caddyfile
```

---

## ۶. نگهداری

- **ارتقا**: `build` سپس `up -d --wait`؛ مهاجرت‌های جدید خودکار پیش از API اجرا می‌شوند.
- **توقف تمیز**: `stop` (API با SIGTERM درخواست‌های در جریان را drain می‌کند).
- **حذف کامل داده‌ها**: `down -v` (برگشت‌پذیر نیست).

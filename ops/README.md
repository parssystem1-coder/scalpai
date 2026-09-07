# راهنمای خودمیزبانی و استقرار کلینیک (ScalpAI v2 Self-Hosted & Ops)

این راهنما راه‌اندازی و نگهداری استک خودمیزبان کلینیک را پوشش می‌دهد. تصمیم معماری استقرار در `docs/adr/ADR-0036-deployment-topology.md`، تصمیم بکاپ و مشاهده‌پذیری در `docs/adr/ADR-0042-backup-restore-and-observability.md` و مرجع عملیاتی در `docs/ops/RUNBOOK.md` است.

## ۱. پیش‌نیازها

- **سیستم‌عامل**: Linux (Ubuntu 22.04 LTS / Debian 12 / AlmaLinux 9) یا macOS / Windows WSL2
- **پردازنده**: حداقل ۴ هسته (توصیه: ۸ هسته)
- **رم**: حداقل ۸ گیگابایت (توصیه: ۱۶ گیگابایت برای pgvector و پردازش مدیا)
- **دیسک**: حداقل ۵۰ گیگابایت SSD (توصیه: ۱۰۰+ گیگابایت NVMe و ظرفیت کافی برای دو snapshot هم‌زمان)
- **داکر**: Docker Engine 24.0+ و Docker Compose v2.20+
- **دامنه**: یک نام دامنه واقعی که به IP این هاست resolve شود (برای TLS خودکار)
- **بکاپ off-site**: S3-compatible endpoint با Object Lock/WORM فعال
- **ابزار restore**: `age`, `jq`, `mc`, `pg_restore`, `psql`

## ۲. سرویس‌های استک (`ops/prod.yml`)

| سرویس | پورت داخلی | پورت عمومی | توضیحات |
| :--- | :--- | :--- | :--- |
| **caddy** | 80, 443 | 80, 443 | پروکسی معکوس، TLS خودکار و ریدایرکت HTTP به HTTPS |
| **web** | 80 | - | فرانت‌اند PWA با healthcheck روی `/health` |
| **api** | 3000 | - | NestJS/Fastify با health و readiness، metrics توکن‌دار و shutdown تمیز |
| **migrate** | - | - | سرویس یک‌باره با نقش owner؛ API پس از مهاجرت موفق بالا می‌آید |
| **postgres** | 5432 | - | PostgreSQL 17 + pgvector |
| **minio** | 9000, 9001 | - | ذخیره‌سازی S3 برای تصاویر و امضاها |
| **redis** | 6379 | - | state مشترک احراز هویت، throttle و rate limit |
| **backup-cron** | - | - | بکاپ روزانه PostgreSQL و MinIO با age، off-site/WORM و alert |

## ۳. راه‌اندازی

```bash
cp ops/prod.env.template ops/prod.env
# ops/prod.env را کامل کنید، سپس:
docker compose -f ops/prod.yml --env-file ops/prod.env config -q
docker compose -f ops/prod.yml --env-file ops/prod.env up -d --build --wait
curl -fsS https://YOUR_DOMAIN/api/v1/health/ready
```

همه secretهای production اجباری‌اند. `BACKUP_AGE_RECIPIENTS_FILE` فقط recipient عمومی را نگه می‌دارد و identity خصوصی باید خارج از هاست باشد. Object Lock را روی bucket off-site قبل از اولین اجرا فعال کنید.

## ۴. بکاپ، بازیابی و drill

```bash
# بکاپ دستی داخل runner
/usr/local/bin/scalpai-backup

# فقط رمزگشایی و checksum، بدون تغییر داده
/usr/local/bin/scalpai-restore 20260907T020000Z --verify-only

# drill امن در staging/scratch
/usr/local/bin/scalpai-restore-drill --use-latest
```

هر snapshot شامل `postgres.dump.age`، `objects.tar.gz.age` و `manifest.json.age` است. `age` احراز اصالت رمزنگاری را فراهم می‌کند؛ manifest checksum را تأیید می‌کند؛ و off-site retention قفل WORM دارد. مسیر کامل incident، key rotation، restore، tenant isolation و deletion در `docs/ops/RUNBOOK.md` است.

## ۵. مشاهده‌پذیری

- `/api/v1/health` فقط liveness است؛ `/api/v1/health/ready` آماده‌به‌کاری Postgres را بررسی می‌کند و Redis را advisory گزارش می‌کند.
- `/api/v1/metrics` بدون `METRICS_TOKEN` فعال نمی‌شود.
- production بدون `ALERT_WEBHOOK_URL` بالا نمی‌آید.
- logها JSON، request-idدار، محدودشده و scrubشده از PHI هستند.
- همه routeها rate limit پیش‌فرض per-clinic/per-IP و سقف global دارند.


# استقرار ScalpAI v2 — مرجع رسمی دستورها

مرجع تصمیم: `docs/adr/ADR-0036-deployment-topology.md`

`npm` تنها package manager این ریپو است. هر دستوری که در جای دیگری با ابزار دیگری نوشته شده باشد، منسوخ است.

## توپولوژی

```
                       Internet
                          |
                    Caddy (TLS/ACME)        <- ops/Caddyfile, :80 -> :443
              /              |            \
     web (nginx)        api (Nest)        /media -> minio
                             |
           postgres (pgvector:pg17) · redis · minio
                             ^
              migrate (یک‌باره، نقش owner) --+
```

- تنها استقرار تولیدی پشتیبانی‌شده: `ops/prod.yml` روی یک هاست با Docker Compose v2.20+.
- Vercel فقط بیلد استاتیک وب را می‌سازد (`npm run build:vercel`)؛ API روی Vercel اجرا نمی‌شود.

## دستورهای توسعه

| کار | دستور |
| :--- | :--- |
| نصب وابستگی‌ها | `npm ci --legacy-peer-deps` |
| سرویس‌های لوکال (PG/MinIO/Redis) | `docker compose -f ops/dev.yml up -d` |
| مهاجرت و seed | `npm run db:migrate` · `npm run db:seed` |
| تست + پوشش | `npm run test` · `npm run test:coverage` |
| typecheck و build همه workspaceها | `npm run typecheck` · `npm run build` |
| نگهبان‌های معماری | `npm run conformance` · `npm run graph -- --check` |
| بودجه باندل | `npm run budget:bundle` |
| تست مرورگری | `npm exec -- playwright test` |

## استقرار تولیدی از صفر

```bash
# 1) متغیرهای محیطی (هیچ مقدار پیش‌فرضی وجود ندارد)
cp ops/prod.env.template ops/prod.env
$EDITOR ops/prod.env      # SCALPAI_DOMAIN, ACME_EMAIL, پسوردها, JWT_SECRET

# 2) اعتبارسنجی فایل compose پیش از هر چیز
docker compose -f ops/prod.yml --env-file ops/prod.env config -q

# 3) بالا آوردن استک؛ --wait تا سالم شدن سرویس‌ها صبر می‌کند
docker compose -f ops/prod.yml --env-file ops/prod.env up -d --build --wait

# 4) شواهد
docker compose -f ops/prod.yml --env-file ops/prod.env ps
docker compose -f ops/prod.yml --env-file ops/prod.env logs migrate   # migrate: applied=N
curl -fsS https://$SCALPAI_DOMAIN/api/v1/health
```

ترتیب بالا آمدن اجباری است: `postgres` سالم -> `migrate` با خروج موفق -> `api`. اگر مهاجرت شکست بخورد، API هرگز بالا نمی‌آید.

## نکات مهم

- **پسوردها**: در URL اتصال Postgres جاسازی می‌شوند؛ فقط حروف و رقم استفاده کنید.
- **نقش‌ها**: `migrate` با نقش owner، runtime فقط با `scalpai_app`.
- **دامنه**: ACME برای نام‌های LAN گواهی صادر نمی‌کند. برای شبکه داخلی، داخل بلاک سایت در `ops/Caddyfile` خط `tls internal` را اضافه کنید.
- **ارتقا**: `docker compose ... build` سپس `up -d --wait`؛ مهاجرت‌های جدید خودکار قبل از API اجرا می‌شوند.
- **خاموش کردن**: `docker compose ... stop` (API با SIGTERM درخواست‌های در جریان را drain می‌کند). `down -v` داده‌ها را هم پاک می‌کند.

## آنچه CI اثبات می‌کند

job `deployment` در `.github/workflows/ci.yml`:

1. `prod.yml` با مجموعه کامل secret معتبر است.
2. `prod.yml` بدون secret **رد** می‌شود (اثبات منفی).
3. ایمیج api و web واقعاً build می‌شوند (`npm ci`، بدون `--ignore-scripts`).
4. استک روی volume خالی بالا می‌آید: `migrate` موفق، سپس healthcheck خود API سبز.

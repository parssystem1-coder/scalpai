# ADR-0036: توپولوژی رسمی استقرار و سیاست ابزارها

- وضعیت: پذیرفته‌شده
- تاریخ: 2026-09-06
- مرتبط با: فاز ۴ سند `docs/WEAKNESSES-V2-10-PHASES.md` (C8, R10, M17, H14, H15, H16, R7, R9)
- جایگزین‌کننده بخش استقرار در: ADR-0024 (پستگرس محلی)، ADR-0026 (MinIO محلی)

## زمینه

پیش از این ریپو سه ادعای استقرار موازی داشت که هیچ‌کدام به‌تنهایی کار نمی‌کرد:

1. `ops/prod.yml` که با پسوردهای پیش‌فرض مشترک (`scalpai_secure_pwd`) بالا می‌آمد، هیچ مرحله مهاجرت جدا نداشت و سرویس `worker` آن به فایل ناموجود `dist/worker.js` اشاره می‌کرد.
2. یک پروژه Vercel برای API (`apps/api/vercel.json`) که با یک سرور NestJS بلندمدت و worker و اتصال دائمی به Postgres/Redis اساساً ناسازگار است.
3. `ops/Caddyfile` با `auto_https off` و سایت `:80`؛ یعنی TLS در عمل خاموش بود و مسیر `/api` هم با `strip_prefix` خراب می‌شد (API خودش روی `/api/v1` سرو می‌کند).

هم‌زمان زنجیره ساخت هم دو ابزار داشت (`npm` در ریپو، `pnpm` در Playwright/Husky/graph) و ایمیج‌ها با `npm install --ignore-scripts` ساخته می‌شدند؛ یعنی ماژول‌های نیتیو (`sharp`، `@node-rs/argon2`) هرگز واقعاً build نمی‌شدند.

## تصمیم

1. **یک توپولوژی پشتیبانی‌شده:** استقرار تولیدی = یک هاست با `docker compose -f ops/prod.yml`؛ شامل Caddy (TLS خودکار) + web (nginx استاتیک) + api (Nest/Fastify) + postgres (pgvector) + minio + redis + backup-cron.
2. **Vercel فقط برای بیلد استاتیک وب:** `npm run build:vercel`. هیچ استقرار Vercel برای API وجود ندارد و `apps/api/vercel.json` حذف شد.
3. **مهاجرت یک سرویس مستقل و یک‌باره است:** سرویس `migrate` با نقش owner اجرا می‌شود، خارج می‌شود، و API فقط با `service_completed_successfully` بالا می‌آید. زمان اجرا (runtime) هرگز با نقش owner به دیتابیس وصل نمی‌شود؛ فقط `scalpai_app` (بدون SUPERUSER و بدون BYPASSRLS، ADR-0003/ADR-0029).
4. **هیچ secret پیش‌فرضی وجود ندارد:** همه متغیرهای حساس در compose با `${VAR:?...}` اعلام شده‌اند؛ نبود مقدار باعث fail شدن فوری استک می‌شود، نه بالا آمدن با پسورد مشترک.
5. **سرویس worker حذف شد:** هیچ ورکر واقعی وجود نداشت. کارهای پس‌زمینه (anchor زنجیره audit، آشتی‌دهی object‌های یتیم) در فازهای ۶ و ۹ طراحی و سپس با یک entrypoint واقعی برگردانده می‌شوند. ادعای بدون کد در docs و compose نمی‌ماند.
6. **ایمیج‌ها pin می‌شوند و نسخه Postgres یکی است:** `pgvector/pgvector:pg17` در CI و `ops/dev.yml` و `ops/prod.yml`؛ `pg_dump` بکاپ هم روی `postgres:17-alpine`. Redis و Caddy و MinIO با تگ مشخص pin شدند و `:latest` ممنوع است.
7. **npm تنها package manager است:** Playwright، Husky، ابزار graph، اسکریپت‌های ریشه و Dockerfileها همه از `npm`/`turbo` استفاده می‌کنند. `npm ci` اجباری است (بدون fallback به `npm install`) و `--ignore-scripts` ممنوع.
8. **اسکریپت‌های ریشه واقعاً همه workspaceها را می‌سازند:** `npm run build` و `npm run typecheck` از `turbo run` استفاده می‌کنند، نه فقط `app-web`. اسکریپت build اپ API دیگر turbo را داخل turbo صدا نمی‌زند و فایل جعلی `dist/index.html` نمی‌سازد.
9. **TLS واقعی:** Caddy روی `{$SCALPAI_DOMAIN}` با ACME فعال و ریدایرکت صریح HTTP به HTTPS؛ هدر HSTS اضافه شد و `strip_prefix /api` حذف شد.

## پیامدها

- استک تولیدی بدون فایل `ops/prod.env` کامل بالا نمی‌آید. این عمدی است.
- دامنه واقعی و قابل resolve لازم است؛ برای نصب LAN باید در Caddyfile خط `tls internal` اضافه شود و CA محلی Caddy روی ایستگاه‌های کاری trust شود.
- ایمیج API شامل devDependencies است، چون سرویس `migrate` از همان ایمیج و با `tsx` مهاجرت را اجرا می‌کند. کوچک‌سازی ایمیج (prune مرحله‌ای) به فاز ۵ سپرده شد.
- اسنیپت‌های قدیمی `pnpm` در `docs/playbooks/*` و گزارش‌های آرشیوی `docs/tasks/*` و `docs/gates/*` بازنویسی نشدند؛ مرجع دستورها `docs/ops/DEPLOYMENT.md` است و پاک‌سازی متن اسناد به آیتم drift اسناد در فاز ۱۰ سپرده شد. سطوح اجراشدنی (کد، هوک، CI، ops) همگی با تست رگرسیون قفل شده‌اند.

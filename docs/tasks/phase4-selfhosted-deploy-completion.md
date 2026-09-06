# گزارش تکمیل فاز ۴ — زیرساخت self-hosted و استقرار امن

- برنچ: `feat/phase4-selfhosted-deploy`
- مرجع فاز: `docs/WEAKNESSES-V2-10-PHASES.md` فاز ۴ (C8، R10، M17، H14، H15، H16، R7، R9)
- تصمیم معماری: `docs/adr/ADR-0036-deployment-topology.md`
- مرجع دستورها: `docs/ops/DEPLOYMENT.md`

## چه چیزی عوض شد

| مورد | وضع قبل | وضع بعد |
| :--- | :--- | :--- |
| مدل استقرار | سه ادعای موازی (compose ناقص، پروژه Vercel برای API، Caddy بدون TLS) | یک توپولوژی: تک‌هاست Docker + Caddy؛ `apps/api/vercel.json` حذف شد |
| مهاجرت | هرگز به‌صورت مستقل اجرا نمی‌شد | سرویس `migrate` یک‌باره با نقش owner؛ API فقط با `service_completed_successfully` بالا می‌آید |
| نقش دیتابیس runtime | همان نقش owner در `DATABASE_URL` | فقط `scalpai_app` با `APP_ROLE_PASSWORD` |
| secret‌ها | `scalpai_secure_pwd` و passphrase پیش‌فرض بکاپ | همه `${VAR:?...}`؛ نبود مقدار = fail فوری |
| worker | سرویسی که `dist/worker.js` ناموجود را اجرا می‌کرد | حذف شد (بازگشت در فازهای ۶/۹ با entrypoint واقعی) |
| بیلد ایمیج | `npm install --ignore-scripts` + `npm run build --filter` (بی‌اثر) | `npm ci` بدون ignore-scripts + `npm exec -- turbo run build --filter=...` و زنجیره ابزار vips |
| TLS | `auto_https off` و سایت `:80` | سایت `{$SCALPAI_DOMAIN}` با ACME، ریدایرکت ۳۰۱ و HSTS |
| مسیر API در پروکسی | `strip_prefix /api` که همه روت‌ها را ۴۰۴ می‌کرد | پرفیکس دست‌نخورده به `api:3000` |
| ایمیج‌ها | `minio:latest`، pg16 در ops و pg17 در CI | همه pin، pg17 در CI/dev/prod، `postgres:17-alpine` برای pg_dump |
| عملیات | بدون `.dockerignore`، healthcheck، سقف منابع و shutdown تمیز | هر چهار مورد اضافه شد (drain با SIGTERM/SIGINT + `stop_grace_period`) |
| ابزار | npm در ریپو، pnpm در Playwright/Husky/graph | همه سطوح اجراشدنی روی npm، قفل‌شده با تست |
| اسکریپت ریشه | `build`/`typecheck` فقط `app-web` | `npm exec -- turbo run build` و `... typecheck` روی همه workspace‌ها؛ بیلد Vercel در `build:vercel` |

## شواهد

- **تست رگرسیون:** `tools/ops/deployment.phase4.spec.ts` — همه موارد بالا را روی فایل‌های واقعی اسسرت می‌کند (در `npm run test`/`test:coverage`).
- **job جدید CI (`deployment`):**
  1. `docker compose -f prod.yml --env-file ci.env config -q` معتبر.
  2. بدون env-file عمداً **رد** می‌شود (اثبات منفی secret اجباری).
  3. `docker compose build api web` — ایمیج‌ها واقعاً با `npm ci` و ماژول‌های نیتیو build می‌شوند.
  4. `up -d --wait api web` روی volume خالی: `migrate` موفق و سپس healthcheck API سبز، سپس `down -v`.
- **گیت‌های قبلی:** typecheck/lint/migrate/seed/test+coverage/build/bundle-budget/conformance/graph بدون تغییر باقی ماندند؛ حالا build و typecheck واقعاً همه workspace‌ها را پوشش می‌دهند.

## مرزهای صریح (در این فاز بسته نشد)

- سخت‌سازی کامل بکاپ (authenticated encryption، off-site، restore test) — فاز ۹/C10. در این فاز فقط fallback پسوردها حذف شد.
- image scan، coverage برای API، e2e در گیت و نام‌گذاری job‌ها — فاز ۵.
- `PORT` خواندن از env در `main.ts` — فاز ۵/H15.
- پاک‌سازی اسنیپت‌های `pnpm` در متن playbook‌ها و گزارش‌های آرشیوی — فاز ۱۰/L1 (مرجع فعلی: `docs/ops/DEPLOYMENT.md`).
- کوچک‌سازی ایمیج API (حالا devDependencies دارد تا `migrate` از همان ایمیج اجرا شود) — فاز ۵.

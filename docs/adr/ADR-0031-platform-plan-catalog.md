# ADR-0031 — کاتالوگ پلن، داده پلتفرم است نه داده تنانت

- Status: Accepted
- Date: 2026-09-06
- Phase: 2 (قفل تنانسی)
- Related: WEAKNESSES C4، §9.1

## زمینه

`PlansController` به owner کلینیک اجازه می‌داد `plans` و `plan_features` را
POST/PUT/DELETE کند. این ردیف‌ها بین همه tenantها مشترک‌اند: یعنی owner یک کلینیک
می‌توانست قیمت، فیچر و سقف پلن **بقیه کلینیک‌ها** را تغییر دهد. علاوه بر آن `limits`
هیچ اعتبارسنجی عددی نداشت (عدد منفی، اعشاری یا نجومی پذیرفته می‌شد).

## تصمیم

1. API تنانت روی کاتالوگ فقط **خواندنی** است (`GET /plans`, `GET /plans/:code`).
2. نوشتن کاتالوگ فقط از CLI پلتفرم: `npm run plans:admin -- <list|upsert|delete>`
   که با نقش migration وصل می‌شود.
3. در DB: `plans` و `plan_features` هم `ENABLE + FORCE RLS` دارند با policy فقط-SELECT
   برای `scalpai_app`، و `INSERT/UPDATE/DELETE` از app role گرفته شده است.
4. اعتبارسنجی: هر مقدار `limits` عدد **صحیح** در بازه `[0, 1e9]` و `price` عدد صحیح در
   بازه `[0, 999999999999]` (سقف فیزیکی `numeric(12,0)`) است. تست‌های overflow/منفی/اعشاری
   هم در `PlanUpsert` (Zod) و هم در validator خود CLI اجرا می‌شوند.
5. قاعده conformance `platform-boundaries` اگر controllerی helperهای نوشتن کاتالوگ را
   import کند، build را قرمز می‌کند.

## جایگزین‌های ردشده

- نگه‌داشتن نوشتن کاتالوگ با گیت `@Roles('owner') + @RequireFeature('admin')`:
  فیچر `admin` را می‌توان به هر پلنی داد و مرز واقعی نیست؛ ضمن اینکه داده مشترک با
  گیت تنانتی محافظت نمی‌شود.
- ساخت نقش `platform_admin` در همین API: کار درست فاز بعدی است (پنل ادمین)، اما
  نوشتن کاتالوگ تا آن زمان نباید در دسترس ترافیک تنانت باشد.

## پیامدها

- مثبت: هیچ مسیر تنانتی نمی‌تواند entitlement بقیه را تغییر دهد.
- منفی: تا آماده‌شدن پنل پلتفرم، تغییر پلن یک عملیات CLI است.

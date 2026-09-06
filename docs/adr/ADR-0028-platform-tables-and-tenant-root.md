# ADR-0028 — جدول‌های پلتفرمی، ریشه تنانت و مرز helperهای مخرب

- Status: Accepted
- Date: 2026-09-06
- Phase: 2 (قفل تنانسی)
- Supersedes: لیست هاردکد `EXEMPT_TABLES` در `tools/conformance/rules/v1.ts`

## زمینه

قاعده `tenant-safety` قبلاً چهار جدول را با لیست هاردکد در کد قاعده معاف می‌کرد
(`__migrations`, `plans`, `plan_features`, `refresh_tokens`, `clinics`). این یعنی معافیت‌ها
نه قابل ممیزی بودند و نه ADR داشتند؛ اضافه‌شدن جدول جدید هم می‌توانست بی‌سر‌وصدا از گیت جا بماند.

## تصمیم

1. لیست جدول‌ها از خود migrationها **استخراج** می‌شود؛ هیچ لیست دستی در قاعده نیست.
2. هر معافیت فقط از `tools/conformance/exceptions.json` و **با ارجاع به ADR معتبر** پذیرفته می‌شود.
3. `clinics` ریشه تنانت است و ستون `clinic_id` ندارد؛ به‌جای آن با `id` ایزوله می‌شود:
   `clinics_self_select` و `clinics_self_update` و **بدون** policy برای INSERT/DELETE.
   ساخت/حذف کلینیک عملیات پلتفرم است، نه API تنانت.
4. `__migrations` زیرساخت است: RLS ندارد و app role همه نوشتن‌ها را از دست داده است.
5. `refresh_tokens` دیگر معاف نیست: ستون `clinic_id` گرفت (ADR-0029).
6. helperهای مخرب (`resetAll`) از API عمومی `@scalpai/db` خارج و به entrypoint
   `@scalpai/db/testing` منتقل شدند و پیش از هر اجرا هدف را اعتبارسنجی می‌کنند
   (NODE_ENV=production، نام/هاست production-مانند و هاست ریموت رد می‌شود).

## جایگزین‌های ردشده

- افزودن `clinic_id` به `clinics`: داده تکراری و بی‌معنا برای ریشه تنانت.
- نگه‌داشتن لیست هاردکد با کامنت: قابل ممیزی نیست و همان بدهی قبلی است.

## پیامدها

- مثبت: هر جدول جدید یا clinic_id + FORCE RLS دارد یا build قرمز می‌شود.
- مثبت: هر معافیت یک ADR و تاریخ دارد.
- منفی: افزودن جدول پلتفرمی جدید یک قدم اضافه (ثبت exception با ADR) دارد.

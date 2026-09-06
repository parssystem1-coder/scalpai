# ADR-0029 — نقش اختصاصی `scalpai_auth` برای مسیرهای پیش از تنانت

- Status: Accepted
- Date: 2026-09-06
- Phase: 2 (قفل تنانسی)
- Related: ADR-0003 (چهار لایه تنانسی)، WEAKNESSES C5/R5

## زمینه

login/refresh/logout پیش از آنکه tenant مشخص شود اجرا می‌شوند، اما `users` و
`refresh_tokens` زیر RLS هستند. راه‌حل قبلی: توابع `SECURITY DEFINER` که مالکشان
**نقش migration/superuser** بود، و `refresh_tokens` هم به‌طور کامل در اختیار app role
قرار داشت (بدون RLS، بدون clinic_id). یعنی یک باگ در لایه auth می‌توانست به کل
داده هر کلینیک برسد.

## تصمیم

1. نقش `scalpai_auth` ساخته می‌شود: `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`.
   چون NOLOGIN است، تنها راه رسیدن به آن، اجرای توابع `SECURITY DEFINER` است.
2. مالکیت توابع auth به همین نقش منتقل می‌شود:
   `fn_auth_login`, `fn_user_claims`, `fn_refresh_issue`, `fn_refresh_find`,
   `fn_refresh_revoke_family`, `fn_refresh_mark_replaced`.
3. دسترسی این نقش حداقلی است: `SELECT` روی `users` (فقط ردیف‌های revoke‌نشده، با
   policy `users_auth_lookup`) و `SELECT/INSERT/UPDATE` روی `refresh_tokens`.
   هیچ دسترسی‌ای به جدول‌های بالینی ندارد.
4. `refresh_tokens` ستون `clinic_id NOT NULL` گرفت، `ENABLE + FORCE RLS` شد و
   دو policy دارد: ایزوله‌سازی کلینیک برای `scalpai_app` و دسترسی سرویس auth.
5. `scalpai_app` **هیچ** privilege مستقیمی روی `refresh_tokens` ندارد؛ این REVOKE در
   `applyGrants()` بعد از هر migration دوباره اعمال می‌شود تا یک `GRANT ON ALL TABLES`
   آینده آن را برنگرداند.
6. rotate/refresh هم claim را از DB می‌خواند و اگر `clinic_id` توکن با کلینیک کاربر
   نخواند، نشست باطل است.

## جایگزین‌های ردشده

- service role با دسترسی کامل و مستندسازی: همان ریسک قبلی با یک کامنت.
- خواندن مستقیم `refresh_tokens` با app role و تکیه بر predicate در کد: یک query
  فراموش‌شده کافی بود تا مرز بشکند.

## پیامدها

- مثبت: سطح حمله لایه auth به شش تابع مشخص و دو جدول محدود می‌شود.
- مثبت: توکن‌ها clinic-scoped شدند و در تست policy matrix اثبات می‌شوند.
- منفی: migration باید بتواند مالکیت تابع را عوض کند (نقش owner/superuser).
- منفی: هر تغییر در شکل ردیف refresh باید در تابع SQL هم اعمال شود.

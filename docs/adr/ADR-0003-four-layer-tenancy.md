# ADR-0003 — ایزوله‌سازی Tenant در چهار لایه

- Status: Accepted
- Date: 2026-08-25
- Phase: 0 (پیاده‌سازی فاز 1)
- Blocks: فاز 1 (RLS + تست منفی cross-tenant)

## زمینه
داده چند کلینیک روی یک DB می‌نشیند؛ نشت داده بین tenant ها بحرانی‌ترین ریسک محصول است.

## تصمیم
چهار لایه دفاعی مستقل:
1. JWT claim (`clinicId`)
2. Repository layer — هر query اجباراً scoped
3. PostgreSQL RLS با `SET LOCAL app.clinic_id` در هر تراکنش (+FORCE)
4. مسیر storage اجباری `clinic-{id}/...` با presigned URL

## جایگزین‌های ردشده
- DB جدا per tenant — هزینه عملیاتی بالا؛ مسیر ارتقا در آینده باز نگه داشته می‌شود

## پیامدها
- مثبت: حتی سوءاستفاده دستی از API به داده tenant دیگر نمی‌رسد
- منفی: هر جدول business قید clinic_id/RLS دارد — توسط conformance rule `tenant-safety` ماشینی پایش می‌شود

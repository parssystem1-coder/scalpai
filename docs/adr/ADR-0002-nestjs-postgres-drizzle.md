# ADR-0002 — استک Backend: NestJS + PostgreSQL + Drizzle

- Status: Accepted
- Date: 2026-08-25
- Phase: 0
- Blocks: فاز 1

## زمینه
بک‌اند به Guard/DI برای RBAC، Audit و Tenancy نیاز دارد؛ دیتابیس باید RLS واقعی بدهد.

## تصمیم
NestJS روی Fastify با اعتبارسنجی Zod؛ PostgreSQL 16 (+pgvector) با Drizzle ORM. SQL خام فقط داخل migration ها.

## جایگزین‌های ردشده
- Express — بدون ساختار DI/Guard آماده
- Prisma — پشتیبانی ناکافی از RLS session variables
- MongoDB — بدون RLS رابطه‌ای

## پیامدها
- مثبت: RLS فقط در Postgres · قرارداد zod مشترک با کلاینت (packages/shared)
- منفی: قید ماندن در اکوسیستم TS سمت سرور

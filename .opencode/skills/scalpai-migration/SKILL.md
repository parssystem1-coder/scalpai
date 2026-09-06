---
name: scalpai-migration
description: Safe Drizzle database migration workflow for ScalpAI v2 following expand→migrate→contract with rollback plan and migration-from-empty verification. Use when the user says "migration بساز", "اسکیما را تغییر بده", "add table/column", "تغییر دیتابیس", or any task in packages/db that alters schema. Enforces engineering-rules §4 and §14.2 (gated lane, RLS policies, clinic_id).
---

# ScalpAI v2 — Migration Safety Workflow

## قبل از هر کاری — دسته‌بندی تغییر

| نوع | مجاز مستقیم؟ |
|---|---|
| ستون nullable جدید · جدول جدید · index جدید | ✅ یک migration |
| NOT NULL با default · constraint جدید روی داده موجود | ⚠️ expand (nullable/backfill) سپس سخت‌گیری در migration بعدی |
| rename · drop · تغییر type · جابجایی داده | 🚫 هرگز در یک گام — برنامه سه‌مرحله‌ای expand→migrate→contract اجباری |

## پروتکل

1. **طرح بنویس** (قبل از تایپ SQL): چه چیزی expand می‌شود · backfill چطور (worker یا batch) · contract چه زمانی (حداقل یک فاز بعد، وقتی همه کلاینت‌ها روی expand هستند) · **rollback دقیقاً چیست**
2. **Schema:** فقط `packages/db` — schema Drizzle را تغییر بده؛ raw SQL فقط داخل فایل migration
3. **تولید و بازبینی دستی:** migration را generate کن و SQL خروجی را خط‌به‌خط بخوان — generate کورکورانه ممنوع
4. **چک‌لیست اجباری روی هر جدول/ستون جدید:**
   - [ ] جدول business: `clinic_id NOT NULL` + index `(clinic_id, ...)` برای query های پرتکرار
   - [ ] RLS: `ENABLE` + `FORCE` + policy ایزوله tenant (`app.clinic_id`)
   - [ ] unique ها partial با `WHERE deleted_at IS NULL`
   - [ ] soft-delete (`deleted_at`) برای جداول business
   - [ ] قرارداد zod مرتبط در packages/shared آپدیت شد
5. **Sync check:** اگر entity آفلاین sync می‌شود → آیا `schemaVersion` قرارداد sync تحت تأثیر است؟ سیاست تعارض per-entity (§8) هنوز معتبر است؟
6. **Rollback:** بالای فایل migration در کامنت، SQL برگشت دقیق بنویس (برای expand: همان drop ستون/جدول؛ برای migrate: مسیر بازگشت داده)
7. **آزمایش لوکال اجباری (PowerShell) — قبل از هر push:**
   - مسیر اول (ADR-0024): PostgreSQL 17 native نصب‌شده — `DATABASE_URL` از `.env` خوانده شود (`localhost:5432`)
   ```powershell
   $env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL').Line.Split('=')[1]
   psql "$env:DATABASE_URL" -c "DROP DATABASE IF EXISTS scalpai_verify;" -c "CREATE DATABASE scalpai_verify;"
   pnpm db:migrate            # از DB خالی — باید سبز شود (به scalpai_verify)
   pnpm test
   psql "$env:DATABASE_URL" -c "DROP DATABASE IF EXISTS scalpai_verify;"
   ```
   - docker compose فقط در CI و پس از مهاجرت آینده استفاده می‌شود
8. **کامیت:** لاین Gated (§14.5) — `feat(db): ...` شامل schema + migration + graph json + تست؛ CI ابری migration-from-empty را دوباره اثبات می‌کند
9. **قرارداد contract:** اگر مرحله ۱ سه‌مرحله‌ای بود، تسک contract (drop ستون قدیمی) را به‌عنوان آیتم PROGRESS فازِ بعد ثبت کن — فراموشی contract = بدهی انباشته

## قواعد سخت
- هیچ migration ای بدون اجرای موفق migration-from-empty لوکال push نمی‌شود
- drop/rename بدون پیشینه expand تأییدشده = توقف کار و پیشنهاد ADR
- تغییر اسکیما بدون آپدیت zod/shared = شکست feature-gate/conformance در CI — خودت زودتر انجام بده

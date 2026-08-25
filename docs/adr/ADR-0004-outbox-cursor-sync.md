# ADR-0004 — Sync با Outbox + Cursor (LWW + سیاست per-entity)

- Status: Accepted
- Date: 2026-08-25
- Phase: 0 (پیاده‌سازی فاز 3)
- Blocks: فاز 3

## زمینه
کلاینت باید آفلاین کامل بنویسد و پس از اتصال بدون دوباره‌کاری sync کند. مقیاس ما تک‌کلینیک است.

## تصمیم
Outbox محلی + `clientMutationId` (idempotent) + pull با cursor + تعارض per-entity طبق §8 سند (append-only برای analyses/notes؛ field-level LWW با version check برای patients/plans). هر mutation دارای `schemaVersion`.

**شرط بازبینی:** قبل از شروع فاز ۳، spike سه‌روزه مقایسه با PowerSync self-host — اگر هزینه ساخت >۲ برابر ادغام بود، تصمیم دوباره بررسی شود.

## جایگزین‌های ردشده
- CRDT — پیچیدگی نامتناسب با مقیاس
- PowerSync خریداری — مالکیت کامل و debug پذیری ترجیح داده شد؛ با spike فوق بازبینی می‌شود

## پیامدها
- مثبت: رفتار قابل پیش‌بینی آفلاین · تست تعارض قطعی
- منفی: نگهداری موتور sync دست‌ساز + ریسک ازدست‌رفتن بی‌صدای داده در LWW خام (با field-level policy مهار شد)

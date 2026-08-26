# ADR-0027 — Local store کلاینت: Dexie/IndexedDB (نه SQLite-WASM)

- Status: Accepted
- Date: 2026-08-26
- Phase: 3
- Blocks: Slice P1/P3/P4

## زمینه
پلی‌بوک ۳ برای Outbox آفلاین دو گزینه گذاشته بود: SQLite-WASM/OPFS یا Dexie. نیاز واقعی فاز ۳: صف mutation های کوچک، وضعیت قطعات آپلود، cache سبک entities — نه query رابطه‌ای سنگین سمت کلاینت.

## تصمیم
- **Dexie (IndexedDB)** به‌عنوان local store وب؛ اسکیمای حداقلی: `outbox(id, seq++, envelope)` · `uploadChunks(key, partIndex)` · `pendingFlags`
- منطق خالص (envelope/LWW/policy/schemaVersion) در packages/sync-client **بدون هیچ وابستگی به Dexie** — Dexie فقط لایه persist در web app است تا همان منطق در Electron/Node هم قابل استفاده بماند
- SQLite-WASM/OPFS وقتی ارزیابی می‌شود که کوئری‌های ترکیبی سمت کلاینت لازم شود (احتمالاً هرگز در معماری server-first ما)

## جایگزین‌های ردشده
- SQLite-WASM/OPFS: پیچیدگی WASM + OPFS فقط در secure-context؛ سود فعلی صفر
- localStorage: synchronous و ۵MB — برای صف/باینری نامناسب

## پیامدها
- مثبت: راه‌اندازی سریع، تست‌پذیری بالا (منطق خالص)، سازگار با PWA فاز ۳
- منفی: IndexedDB transactional semantics متفاوت از SQL — انتقال داده به سرور همچنان از مسیر Sync API رسمی است نه خواندن مستقیم

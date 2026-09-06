# ADR-0039 — صحت همگام‌سازی و حالت آفلاین (فاز ۷)

- **وضعیت:** Accepted
- **تاریخ:** 2026-09-07
- **دامنه:** WEAKNESSES H2, H3, H4, H5, H6, H8, C9, M6
- **جایگزین مکمل:** ADR-0004 (outbox/cursor sync)، ADR-0027 (Dexie local store)

## مسأله

sync در عمل یک‌طرفه و شکستنی بود:

1. کلاینت هرگز `sync/pull` را صدا نمی‌زد؛ دستگاه دوم تا زمانی که کاربر دستی refresh
   نمی‌کرد چیزی نمی‌دید.
2. `server_seq` یک `bigserial` است و **قبل از COMMIT** گرفته می‌شود. تراکنش کند
   می‌تواند seq کوچکتر را دیرتر commit کند؛ کلاینتی که cursor را جلو برده، آن
   جهش را برای همیشه از دست می‌داد.
3. حل تعارض به ساعت دستگاه تکیه می‌کرد: گوشی‌ای که یک ساعت جلو بود همیشه
   برنده می‌شد و گوشی عقب همیشه ویرایشش را بی‌صدا از دست می‌داد.
4. کل batch در یک تراکنش بود؛ یک آیتم خراب، ۱۹ جهش سالم را هم rollback می‌کرد.
5. `client_mutation_id` کلید یکتای سراسری بود، پس دو کلینیک مستقل می‌توانستند با هم
   تصادم کنند.
6. صف محلی یک دیتابیس مشترک به نام `scalpai-offline` داشت که با logout پاک نمی‌شد، و با
   `clear() + bulkAdd()` بازنویسی می‌شد — یک کرش در همان پنجره، همه جهش‌ها را می‌برد.

## تصمیم

### ۱) ترتیب فقط با شمارنده سرور (H6)

`patients` و `treatment_plans` دو ستون جدید دارند: `row_version` و `field_versions`، که
تریگر `fn_bump_row_version` نگه‌داری می‌کند. میدان وقتی اعمال می‌شود که سرور از
زمان `baseVersion` کلاینت آن را تغییر نداده باشد؛ در غیر این صورت مقدار سرور می‌ماند و
نام میدان در `conflicts` برمی‌گردد. `baseVersion` برای `op=update` **الزامی** است و در سطح
قرارداد (zod) رد می‌شود. `clientUpdatedAt` و `clientClockOffsetMs` فقط metadata هستند.

پنجره `SUPPORTED_SCHEMA_VERSIONS` فقط `[1]` است: پیش‌پذیرش نسخه ۲ که وجود ندارد، تنها
راهی برای اعمال قرارداد ناموجود بود.

### ۲) cursor مبتنی بر خط اطمینان commit (H5)

`mutations.commit_xid xid8` شناسه تراکنش نویسنده را نگه می‌دارد. cursor یک جفت است
(`commit_xid:server_seq`) و pull فقط ردیف‌هایی را می‌دهد که:

```sql
commit_xid < pg_snapshot_xmin(pg_current_snapshot())
```

یعنی هیچ تراکنش در‌جریانی نمی‌تواند بعداً ردیفی قبل از آن خط بنویسد. cursor از دید
کلاینت **opaque** است و مقدار نامعتبر با `SYNC_CURSOR_INVALID` رد می‌شود نه با ریست به صفر
(که معنایش تکرار کل ledger در هر poll است).

### ۳) یک savepoint برای هر جهش و ledger فقط applied (H3/H4)

هر آیتم درون `SAVEPOINT` خودش اجرا می‌شود؛ خطا فقط همان آیتم را برمی‌گرداند.
ledger فقط برای جهش **اعمال‌شده** نوشته می‌شود و محتوای آن delta واقعی سرور است
(ردکت‌شده + `_fields` + `_id` + `_version`)، نه آرزوی خام کلاینت. کلید یکتایی به
`(clinic_id, client_mutation_id)` تغییر کرد و تصادم همزمان از طریق همان قید (sqlstate
23505) به پاسخ `duplicate` ترجمه می‌شود.

پیام خطای درایور هرگز برنمی‌گردد: نقض CHECK در Postgres متن کامل ردیف را نقل می‌کند و
برای `patients` این یعنی PHI. فقط sqlstate برمی‌گردد.

### ۴) صف محلی پراینسیپال‌محور با dead-letter (C9/H8/M6)

- نام دیتابیس Dexie از `(clinicId, userId)` ساخته می‌شود؛ logout آن را **حذف** می‌کند و
  دیتابیس مشترک قدیمی هر جا دیده شود پاک می‌شود.
- هر رکورد جداگانه و در یک تراکنش `put` می‌شود؛ `clear() + bulkAdd()` حذف شد.
- هر رکورد `attempts`، `nextAttemptAt` و `lastError` دارد. backoff نمایی تا ۵ دقیقه و پس از
  `OUTBOX_MAX_ATTEMPTS` رکورد به جدول `deadLetter` می‌رود. رد قطعی سرور بدون تلاش مجدد
  dead-letter می‌شود.
- `flushOutbox` تعداد round محدود دارد و علت توقف را نام می‌برد
  (`drained` / `backoff` / `max-rounds` / `transport`) — جای حلقه `while (size > 0)`.
- پاکسازی رکوردهای غیرمتعلق به پراینسیپال فعال: جهش هرگز با توکن کلینیک دیگر push
  نمی‌شود (M6).

### ۵) pull واقعی در کلاینت (H2)

cursor در جدول `syncState` پایدار است. چرخه sync روی mount، رویداد `online`، بازگشت
به تب و یک تایمر poll اجرا می‌شود که با هر خطای پیاپی backoff می‌گیرد. cursor فقط
**پس از** تحویل صفحه به کش (invalidate کوئری‌ها) جلو می‌رود.

## پیامدها

- **شکست قرارداد:** `GET /sync/pull` دیگر `sinceSeq`/`nextSeq` ندارد؛ `cursor` دارد.
  `baseVersion` از رشته timestamp به عدد `row_version` تغییر کرد. تنها مصرف‌کننده، کلاینت
  خود ماست و در همین PR به‌روز شده است.
- رضایت‌نامه هنوز پاکت مختص خود را در قرارداد §8 ندارد. کد قبلی برای آفلاین پاکت
  `patients` جعل می‌کرد؛ این باعث 400 شدن کل batch و قفل صف می‌شد. از این پس در لحظه
  enqueue با خطای صریح رد می‌شود (بدون آلوده کردن صف)؛ پاکت رسمی رضایت‌نامه کار فاز
  بعدی است.
- `resume` واقعی آپلود و مهاجرت `pendingUploads` از localStorage به Dexie در دامنه فاز ۸
  (H7) می‌ماند؛ جدول آن اینجا در اسکوپ جدید ساخته شده است.
- تریگر نسخه روی هر UPDATE اجرا می‌شود — هزینه یک دیف jsonb به ازای هر ویرایش، در مقابل
  از دست نرفتن داده بالینی.

## شواهد

- `packages/db/sql/0013__phase7_sync_correctness.sql`
- `packages/sync-client/src/{contract,cursor,mutation,lww,outbox}.ts`
- `packages/db/src/repos/sync.repo.ts`
- `apps/web/src/offline/{db,sync}.ts` و `apps/web/src/offline/SyncProvider.tsx`
- تست‌ها: `packages/sync-client/src/{sync-core,flush}.spec.ts`،
  `apps/web/src/offline/offline-sync.spec.ts`، `apps/api/test/sync.phase7.spec.ts`،
  `apps/api/test/sync.spec.ts`

# ADR-0034 — state مشترک (throttle، entitlement، rate-limit) روی Redis

- Status: Accepted
- Date: 2026-09-06
- Phase: 3 (نشست، توکن و Auth transaction integrity)
- Related: WEAKNESSES R11/M6/L4، ADR-0033

## زمینه

سه کنترل امنیتی روی `Map` درون‌پروسه نشسته بودند: پنجره‌های throttle ورود،
cache اصالت principal و cache entitlement. روی دو replica معنایش این است که سقف
۲۰ تلاش در دقیقه عملاً ۴۰ است، و logout روی یک ریپلیکا با cache گرم ریپلیکای
دیگر پوشانده می‌شود. همزمان، endpointهای پرهزینه (sync push/pull، upload،
analysis) هیچ سقف نرخی نداشتند و فقط quota ماهانه داشتند.

## تصمیم

1. یک قرارداد `KvStore` با دو درایور: `redis` و `memory`.
2. در production نبود `REDIS_URL` باعث **شکست boot** می‌شود. یک limiter درون‌پروسه
   پشت چند replica یک کنترل امنیتی به‌طور خاموش اشتباه است، نه یک default ملایم.
   در dev/test درایور memory کافی است (تک‌پروسه).
3. کلاینت Redis دستی و بی‌وابستگی است (RESP2 روی `node:net`). کل سطح مورد نیاز
   `GET/SET/DEL/INCR/PEXPIRE/PING` است و افزودن یک دپندنسی runtime جدید به یک
   استک بالینی self-hosted را توجیه نمی‌کرد. خطای پروتکل یا timeout، سوکت را
   می‌بندد تا هرگز پاسخ یک درخواست به درخواست دیگر داده نشود.
4. TLS در دامنه نیست: اتصال فقط `redis://` روی شبکه خصوصی compose است؛
   `rediss://` صریحاً رد می‌شود تا کسی خیال راحت کازب نداشته باشد.
5. هر کلید TTL دارد و namespace دارد:
   `scalpai:{env}:throttle:{bucket}:{ipDigest}` · `scalpai:{env}:auth:lock:{emailDigest}` ·
   `scalpai:{env}:t:{clinicId}:entitlement` · `scalpai:{env}:t:{clinicId}:rl:{endpoint}`.
   شناسه‌های کاربری (ایمیل، IP) فقط به شکل digest کوتاه‌شده sha256 در کلید
   می‌نشینند؛ limiter فقط به تساوی نیاز دارد، نه به مقدار.
6. درایور memory با سقف کلید و eviction بر مبنای ترتیب درج، مرز حافظه دارد.
7. قطعی Redis: به مدت کوتاه به پنجره‌ی درون‌پروسه درجه می‌خورد (هنوز محدود
   می‌کند، فقط مشترک نیست) و بعد دوباره سراغ منبع واقعی می‌رود. fail-open نیست.
8. L4: `@RateLimit(name, max, windowMs?)` روی endpointهای پرهزینه، با کلید
   tenant-scoped و قابل override از env (`RATE_LIMIT_<NAME>_MAX/_WINDOW_MS`).
   quota پلن می‌گوید «چند تا در ماه»، این گیت می‌گوید «چقدر سریع».

## جایگزین‌های ردشده

- `ioredis`/`node-redis`: راحت‌تر، اما یک دپندنسی با درخت وابستگی بزرگ در مسیر
  auth و ریسک lockfile؛ برای شش دستور ارزشش را ندارد.
- نگه‌داشتن throttle در Postgres: هر درخواست ورود یک write به DB بالینی.
- sticky session روی load balancer: مرز امنیتی را به تنظیمات شبکه گره می‌زند.

## پیامدها

- مثبت: بودجه‌ها واقعاً مشترکند؛ در تست دو StateStore مستقل (دو ریپلیکا) روی
  یک Redis در سقف مشترک رد می‌شوند.
- مثبت: باطل شدن principal و تغییر پلن دیگر پشت cache گرم یک ریپلیکا گم نمی‌شود.
- منفی: یک سرویس بیشتر در مسیر درخواست؛ با timeout و درجه‌ی محدود مهار شده.
- منفی: یک پروتکل دستی برای نگه‌داری؛ به همین دلیل قرارداد KV هم روی درایور
  memory و هم روی Redis واقعی در CI تست می‌شود.

# ADR-0052: کانال SMS.ir به‌عنوان failover دوم SMS (موج ۲ / D07)

- Status: accepted
- Date: 2026-09-23
- Supersedes: nothing. Extends ADR-0046 (adapter port) و موج ۱ (`PHASE5-DEBT-WAVES.md`).
- Related: D07/D08/D09 در `docs/reviews/PHASE5-DEBT-WAVES.md`

## Context

سند بدهی موج ۲ شرط صریح دارد: «SMS.ir adapter + کانال در `MESSAGING_CHANNELS` فقط با ADR کوتاه اگر enum عوض شود». موج ۱ ترتیب پیش‌فرض را SMS-first کرد و failover همان-tick را آورد، اما تنها کانال SMS تولیدی کاوه‌نگار است: اگر کاوه‌نگار قطع یا مسدود شود (اعتبار، block شدن خط فرستنده)، failover واقعی SMS وجود ندارد و مسنجرها هم تا موج ۲ stub و در production fail-closed هستند — یعنی زنجیره می‌تواند تمام شود و پیام نرود.

## Decision

1. **`smsir` عضو ششم `MESSAGING_CHANNELS` می‌شود** (بعد از کاوه‌نگار)، با adapter واقعی روی همان `HttpClientPort` (الگوی `KavenegarAdapter`) و capabilityهای SMS: `supportsInbound: false` در موج ۲، `requiresOptIn: false`، `maxBodyChars: 480`.
2. **مجموعه‌ی بسته در DB با migration 0022 باز می‌شود** (تابع `fn_aftercare_steps_validate` + دو CHECK ستون). قرارداد shared ↔ CHECK 0017 دست‌نخورده می‌ماند: هر دو از یک مجموعه‌ی شش‌تایی حکایت می‌کنند.
3. **`DEFAULT_CHANNEL_ORDER` عوض نمی‌شود**: کاوه‌نگار همچنان اولین SMS است؛ SMS.ir صرفاً عضو زنجیره است و بعد از آن می‌آید. کلینیک می‌تواند با `clinicOrder` آن را جلو بکشد (مثلاً کاوه‌نگار → SMS.ir → مسنجرها). SMS.ir «جایگزین» نیست — «حلقه‌ی دوم» است، مطابق متن موج ۲.
4. **Telegram/WhatsApp واقعی این موج نیست** (D09): ADR خارج‌از محدوده‌ی جدا ثبت می‌شود؛ stub و fail-closed می‌مانند تا تقاضای واقعی کلینیک.
5. env پروایدر: `SMSIR_API_KEY` + `SMSIR_SENDER` (خط فرستنده). وب‌هوک ورودی در موج ۲ سیم‌کشی نمی‌شود — پس 0022 عمداً هیچ ردیفی در `webhook_providers` seed نمی‌کند (ردیف بدون مسیرِ احراز هویت‌شده یعنی نقشه‌ی گنجِ نیامده) و adapter `parseInbound: () => null` برمی‌گرداند. ستون کلیدِ webhook_providers هم `webhook_secret` است نه `secret`.

## Consequences

- هر سه محل قفل enum در Postgres باید با 0022 باز شوند؛ کلینیک‌های موجود بی‌اثرند (مقادیر قبلی معتبر می‌مانند).
- تست قرارداد موج ۱ («شکست Bale → یک send روی kavenegar») همچنان باید سبز بماند؛ تست جدید همان قرارداد را برای زنجیره‌ی کاوه‌نگار → SMS.ir اثبات می‌کند.
- اعتبار SMS.ir مستقل از کاوه‌نگار است؛ قطعیِ یکی فقط هزینه‌ی مسیر دوم را دارد نه از‌دست‌رفتن پیام.
- ریسک پذیرفته‌شده: تا وقتی `clinicOrder` تنظیم نشده، failover به SMS.ir فقط بعد از اتمام کاوه‌نگار می‌رسد — قابل قبول چون کاوه‌نگار ارزان‌تر و قراردادی است.

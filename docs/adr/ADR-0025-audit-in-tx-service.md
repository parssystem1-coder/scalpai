# ADR-0025 — Audit به‌صورت سرویسِ داخل تراکنش، نه Interceptor

- Status: Accepted
- Date: 2026-08-25
- Phase: 1
- Blocks: گیت نهایی فاز 1 (ثبت انحراف پلی‌بوک 1.3 — الزام گیت چک‌پوینت)

## زمینه
پلی‌بوک فاز ۱ (بند 1.3) در ابتدا «AuditLogInterceptor» را پیش‌بینی کرده بود: رهگیری پاسخ/درخواست در لایه HTTP و نوشتن ردیف audit پس از اتمام عملیات. حین ساخت فاز ۱ دو واقعیت این طرح را تضعیف کرد:

1. **اتمیک بودن:** ردیف audit خارج از تراکنش دامنه یعنی احتمال mutation بدون audit (crash بین COMMIT و write) یا audit بدون mutation (rollback بعد از log) — هر دو نقض append-only معنادار.
2. **زمینه tenant:** Interceptor به AsyncLocalStorage دسترسی دارد ولی نه به همان tx؛ نوشتن جدا یعنی دو اتصال و دو تراکنش برای یک فعل.

## تصمیم
- `appendAudit(tx, entry)` داخل **همان تراکنش** دامنه صدا زده می‌شود (الگوی Audit-as-Service)؛ ردیف audit با خود mutation اتمیک commit می‌شود.
- **تغییرناپذیری در SQL تضمین می‌شود:** `REVOKE UPDATE, DELETE ON audit_log FROM scalpai_app` در grants مهاجرت — حتی نقص کد هم قادر به بازنویسی تاریخ نیست.
- **زنجیره hash per-clinic:** `row_hash = sha256(prev_hash ‖ payload)`؛ خواندن prev داخل همان tx مستأجر + قفل `pg_advisory_xact_lock(hashtext(clinicId))` (Slice H) تا نوشتن همزمان زنجیره را fork نکند.
- Interceptor فقط برای افعالی که مسیر Service/Repo ندارند (آینده: MCP calls) به‌عنوان wrapper حول همین سرویس استفاده خواهد شد، نه جایگزین آن.

## جایگزین‌های ردشده
- AuditLogInterceptor خارج از tx (طرح اولیه پلی‌بوک): عدم اتمیک بودن + ریسک gap
- CDC / trigger های DB برای audit: پیام‌های خطا و متادیتای سطح اپلیکیشن (user_id, action semantics) در trigger دست‌نیافتنی‌تر و تست‌پذیری سخت‌تر

## پیامدها
- مثبت: اتمیک بودن اثبات‌شده با تست (`records mutations in a verifiable chain`، تست همزمانی Slice H) · REVOKE سطح SQL · verifyChain سبز روی PG واقعی
- منفی: هر repo که write می‌کند باید صریحاً appendAudit صدا بزند — قانون conformance آینده می‌تواند فراموشی را بگیرد (بدهی ثبت‌شده)
- خنثی: anchor هفتگی آخرین hash (فاز ۳) مستقل از این تصمیم است و روی همین زنجیره سوار می‌شود

## تأثیر بر اسناد
- پلی‌بوک فاز ۱ بند 1.3: «AuditLogInterceptor» → «AuditService داخل تراکنش» (این ADR مرجع انحراف است)
- DESIGN-V2 §7/§13: متن فعلی («AuditLog Interceptor») با همین مفهوم سازگار خوانده می‌شود؛ بازنویسی واژه‌ای لازم نیست

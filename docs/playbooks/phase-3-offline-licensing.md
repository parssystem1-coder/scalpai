# فاز 3 — آفلاین و لایسنس (Sync + Licensing + Self-Hosted + Consent)

> زمان: هفته ۹-۱۲ · پیش‌نیاز: DoD فاز 2

## مرجع سند
DESIGN-V2 §8 (Sync) · §9+§9.1 (Licensing/Entitlement) · §13 · ADR-4/5/15

## تسک‌ها

### 3.1 packages/sync-client + Sync API
- Local DB (SQLite WASM/OPFS یا Dexie — تصمیم در ADR کوچک مستند شود)
- Outbox + clientMutationId idempotent · pull cursor-based · LWW با updatedAt سروری
- mutations جدول سرور (§6.5) + /sync/push + /sync/pull
- schemaVersion در push/pull — سرور ۲ نسخه اخیر قرارداد را بپذیرد؛ کلاینت قدیمی‌تر = پیام ارتقا نه کرش
- سیاست تعارض per-entity (§8 سند): append-only برای analyses/notes · field-level LWW + version check برای patients/treatment_plans
- تست تعارض: دو کلاینت همزمان یک patient و یک treatment_plan را ویرایش کنند — بدون ازدست‌رفتن فیلد

### 3.2 آپلود resume
- ادامه chunk از سر جای قطع · badge pending_upload تا state=done
- اولویت sync: mutations کوچک قبل از تصاویر

### 3.3 Licensing
- packages/licensing: صدور JWT Ed25519 (سرور) + verify لوکال (public-key توکار)
- Grace 14d · last_seen_clock ضدtamper · حالت read-only بعد از grace
- اتصال به EntitlementService (§9.1): features[] لایسنس = منبع UI gating آفلاین

### 3.4 Self-Hosted bundle (ops/)
- docker-compose.prod.yml: api+postgres(pgvector)+minio+caddy+worker
- Caddyfile TLS · env template · نصب یک‌دستوری
- Backup داخلی: worker شبانه pg_dump رمزشده به S3/دیسک + صفحه restore در تنظیمات owner
- Audit anchor worker: hash هفتگی audit_log به storage جدا از DB (WORM-like)

### 3.5 Consent دیجیتال (A15)
- سازنده فرم ساده + امضا (canvas) + ذخیره در consents متصل به service/session
- نمایش در پرونده بیمار + audit کامل

### 3.6 PWA manifest (وب کلینیک)
- installable + آیکون‌ها + theme Microscopy Premium

## Definition of Done
```powershell
pnpm e2e --grep "@offline"   # قطع نت→ثبت بیمار/جلسه/تحلیل→وصل→sync بدون خطا
pnpm e2e --grep "@license"   # جلو زدن ساعت سیستم → grace رفتار صحیح
docker compose -f ops/prod.yml config -q   # compose معتبر
```
- [ ] sync دوباره‌کاری صفر (clientMutationId dedupe تست)
- [ ] kill وسط import/upload → resume صحیح
- [ ] license دستکاری‌شده (امضای نامعتبر) رد می‌شود
- [ ] backup→restore drill در محیط تست یکبار واقعاً اجرا شد
- [ ] تعارض field-level دو کلاینت بدون گم‌شدن داده حل می‌شود (تست treatment_plan)
- [ ] anchor هفتگی audit_log تولید و verify می‌شود

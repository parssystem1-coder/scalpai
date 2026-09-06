# Phase 3 Completion Brief — آفلاین و لایسنس (فرمت Nexora)

> پیش‌نیاز: گیت فاز ۲ PASS (docs/gates/GATE_REVIEW_phase-2-retry-2026-08-26.md) ✓
> کادنس: هر slice چرخه کامل §12؛ بعد از هر slice **STOP & REPORT**.
> قانون W23: قبل از برنچ هر slice → `git checkout main && git pull`.

## §0 — Scope قفل‌شده
فقط هفت slice زیر از پلی‌بوک ۳ (3.1..3.6). خارج از اسکوب صریحاً: CRDT، PowerSync (مگر spike معکوس شود)، Electron واقعی (فاز ۴)، multi-branch UI، OpenAPI/webhooks.
تصمیم معماری Local-DB در ADR-0027 ثبت می‌شود (Dexie/IndexedDB به‌جای SQLite-WASM — دلیل: بدون WASM copy، پشتیبانی گسترده، کافی برای صف Outbox).

## Slice P1 — هسته sync-client (خالص)
- packages/sync-client: پاکته mutation `{clientMutationId, entity, op, schemaVersion, payload, baseVersion?}` · صف Outbox درون حافظه+serialize · توابع خالص mergeLWW(fieldLevel) و policy جدول per-entity (§8: analyses append-only؛ patients/treatment_plans field-LWW)
- schemaVersion: const CURRENT=1، SUPPORTED=[1] (پنجره ۲تایی آماده)
- unit: dedupe با clientMutationId، LWW فیلدی هیچ فیلدی را نمی‌بازد (سناریوی دو کلاینت)، رد schemaVersion قدیمی‌تر از پنجره

**⛔ STOP & REPORT**

## Slice P2 — Sync API سمت سرور
- migration 0008: جدول mutations (§6.5: bigserial, clinic_id, user_id, client_mutation_id uuid UNIQUE, entity, op, payload jsonb, server_seq bigserial, at) + جدول treatment_plans (§6.1) با updated_at trigger + RLS/FORCE + ایندکس‌ها
- `POST /sync/push` (batch mutations؛ dedupe با unique؛ اعمال ترتیبی داخل یک tx؛ خطای هر آیتم مستقل) · `GET /sync/pull?sinceSeq=` (delta بر اساس server_seq)
- schemaVersion window در push؛ پاسخ per-item {status: applied|duplicate|rejected, reason}
- integration: دو کلاینت همزمان patient (field-LWW بدون گم‌شدن) · duplicate push صفر دوباره‌کاری · analyses دوبار = دو ردیف append-only

**⛔ STOP & REPORT**

## Slice P3 — وب آفلاین (اتصال sync-client)
- Dexie در وب: outbox persist + entities cache؛ آنلاین↔آفلاین detection؛ flush خودکار + badge تعداد pending؛ صف: mutations کوچک اول، تصاویر بعد
- e2e **@offline**: قطع نت (context.setOffline) → ایجاد بیمار → وصل → sync بدون خطا و رکورد روی سرور

**⛔ STOP & REPORT**

## Slice P4 — آپلود resume + pending_upload badge
- chunked PUT (قطعات ۸MB) با ثبت قطعات موفق در IndexedDB؛ kill وسط → ادامه از سر جای قطع؛ badge pending_upload روی tile تا done
- e2e اثبات kill وسط آپلود بزرگ → resume → done (با throttle CDP)

**⛔ STOP & REPORT**

## Slice P5 — packages/licensing
- Ed25519 (@noble/curves یا node:crypto در سرور + webcrypto کلاینت) · اسکریپت تولید جفت‌کلید · pubkey عمومی در shared (توکار)
- `POST /licensing/issue` (فقط owner، امضای JWT لایسنس: clinicId, plan, features[], iat/exp, graceDays:14)
- verify لوکال: امضا + exp+grace + **ضدtamper ساعت**: ذخیره lastSeenMax در localStorage؛ عقب‌گرد >۵ دقیقه یا جلوپرش >grace ⇒ flag
- read-only بعد از grace: interceptor/guard کلاینت + راهنمای سرور
- unit/e2e **@license**: لایسنس دستکاری‌شده رد می‌شود · جلو زدن ساعت → grace رفتار صحیح (page.clock)

**⛔ STOP & REPORT**

## Slice P6 — Self-hosted bundle + بکاپ + anchor
- ops/prod.yml ‏(api+postgres(pgvector)+minio+caddy+worker) · Caddyfile TLS · prod.env.template · `docker compose config -q` به‌عنوان gate محلی
- بکاپ: اسکریپت شبانه pg_dump رمزشده (openssl enc) به دیسک/S3 + اسکریپت restore؛ **drill واقعی لوکال**: dump از db فعلی → restore به db نو → مقایسه شمارش جداول (بدون نیاز به Docker)
- Audit anchor worker: job هفتگی آخرین row_hash → فایل anchor در MinIO bucket جدا (WORM-like) + verify
**⛔ STOP & REPORT**

## Slice P7 — Consent دیجیتال + PWA manifest
- فرم سازنده ساده (schema jsonb) + امضای canvas + POST consents متصل service/patient + نمایش در پرونده + audit
- PWA manifest + آیکون‌ها + theme-color Microscopy Premium (installable)

**⛔ STOP & REPORT**

## Exit criteria پایان فاز ۳ — همه با اجرا/CI اثبات:
1. `pnpm e2e --grep "@offline"` سبز — sync بدون خطا و بدون دوباره‌کاری (dedupe تست)
2. `pnpm e2e --grep "@license"` سبز — ساعت جلو/grace صحیح؛ لایسنس دستکاری‌شده رد می‌شود
3. kill وسط آپلود بزرگ → resume تا done (تست P4)
4. تعارض field-level دو کلاینت بدون گم‌شدن داده (integration P2 + unit P1)
5. `docker compose -f ops/prod.yml config -q` پاس · backup→restore drill اجرا شده و خروجی ثبت است
6. anchor هفتگی تولید و verify می‌شود (تست)
7. coverage ≥70 حفظ · conformance/graph سبز · budget سبز
8. GATE_REVIEW نهایی فاز ۳ = PASS

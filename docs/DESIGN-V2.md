# ScalpAI v2 — سند طراحی معماری (Design Doc)

> نسخه: **2.3** · تاریخ: 2026-08 · وضعیت: پیش‌نویس برای تأیید مالک محصول
>
> **تغییرات نسخه 2.3:** بازطراحی §14 — CI ابری با Postgres واقعی و migration-from-empty · Conformance Harness ماشینی (ADR-21) · Project Graph مکانیکی (ADR-22) · سیاست Merge دو لاین با auto-merge (ADR-23).
>
> **تغییرات نسخه 2.2:** افزودن بخش ۱۹ — سرور MCP و Tool Registry واحد (ADR-20 · پیش‌فرض فعال per-clinic) · فیچر mcp_api در پلن‌ها · ریسک پرامپت‌اینکشن در §16.
>
> **تغییرات نسخه 2.1:** لایه Adapter چندارائه‌دهنده AI به‌جای وابستگی ثابت به یک vendor (ADR-18) · سیاست تعارض Sync per-entity + schemaVersion · تقویم Jalali-first (ADR-19) · ERD مالی رابطه‌ای (invoice_items) · partial unique index با soft-delete · جستجوی متنی pg_trgm فارسی · سخت‌سازی OTP + Audit anchor + 2FA پنل admin · RTO/RPO رسمی · ریسک‌های جدید §16 (ASR فارسی · SaaS تحریمی · pre-approval قالب SMS) · اصلاح framing شکاف بازار §18 · فاز ۵ Aftercare-first (5a→5b) · پیوست Unit Economics.
>
> **تغییرات نسخه 2.0:** ادغام نتایج مقایسه جامع با بهترین‌های جهانی (Pabau، Zenoti، Fresha، NextMotion، DermEngine، FotoFinder، Dermi Atlas، LumoScanner، Mentera و مطالعه شکاف Aftercare). موارد جدید: پورتال بیمار و رزرو آنلاین، موتور Aftercare چندکاناله، رضایت‌نامه دیجیتال، کنترل کیفیت تصویر، Evolution Tracker سطح ضایعه، جستجوی تصویری اطلس، AI Scribe آفلاین، Copilot داده‌کلینیک، توضیح‌پذیری مدل (Grad-CAM)، لایه تجاری (فاکتور/عضویت/انبار)، PWA و Open API. تحلیل کامل شکاف در **بخش ۱۸**.
>
> این سند جایگزین کامل معماری نسخه فعلی (Electron آفلاین با SQLite محلی) است.

---

## فهرست

| # | بخش |
|---|---|
| 1 | چشم‌انداز و تعریف محصول |
| 2 | مدل‌های استقرار |
| 3 | معماری کلی سیستم |
| 4 | استک فناوری و تصمیم‌های کلیدی |
| 5 | ساختار Monorepo |
| 6 | معماری داده و ERD |
| 7 | چندمستأجری و ایزوله‌سازی |
| 8 | معماری Offline-First و Sync |
| 9 | سیستم لایسنس بدون قفل سخت‌افزاری |
| 10 | ماژول یادگیری ماشین — Data Flywheel |
| 11 | لایه آموزش سه‌بعدی بیمار (Education Layer) |
| 12 | زبان طراحی UI/UX منحصربه‌فرد |
| 13 | امنیت و انطباق |
| 14 | مهندسی کیفیت: تست، CI/CD، انتشار |
| 15 | نقشه راه اجرا (به‌روزشده) |
| 16 | ریسک‌ها و راهکارها |
| 17 | خلاصه ADR ها |
| 18 | تحلیل شکاف قابلیت‌ها با بهترین‌های دنیا |
| 19 | لایه ابزار AI — سرور MCP (ADR-20) |
| الف | پیوست الف — قالب Unit Economics |

---

## 1. چشم‌انداز و تعریف محصول

**ScalpAI v2** پلتفرم ابری مدیریت کلینیک تریکولوژی با تحلیل هوشمند پوست سر است که چهار طرف را هم‌زمان خدمت می‌کند:

- **کلینیک:** مدیریت بیماران، جلسات و رزرو، گالری، طرح درمان، رضایت‌نامه، گزارش PDF، درآمد (فاکتور/عضویت/انبار)، ارتباط خودکار با بیمار (Aftercare)
- **تریکولوژیست:** تحلیل کمّی تصویر، مقایسه تک‌ضایعه بین جلسات، دستیار AI، نوت‌برد صوتی جلسه
- **بیمار:** پورتال شخصی — رزرو آنلاین، فرم پیش‌ازمراجعه، مشاهده before/after و پیشرفت خودش، انیمیشن آموزشی سه‌بعدی مشکلش ← پایبندی بیشتر به درمان
- **سازنده (شما):** درآمد اشتراک/لایسنس بدون قفل سخت‌افزاری + Data Flywheel برای ساخت موتور تخصصی اختصاصی

### کاربران سیستم (Personas)

| نقش | دسترسی | توضیح |
|---|---|---|
| `owner` (مدیر کلینیک) | کامل + کاربران + لایسنس + بکاپ + گزارش مالی | صاحب حساب |
| `trichologist` | بیماران، جلسات، تحلیل، گزارش، Scribe | متخصص؛ منبع Gold-label برای ML |
| `receptionist` | بیماران، جلسات، گالری، فاکتور | بدون نتایج بالینی تحلیل (قابل تنظیم) |
| `patient` (بیمار) | فقط داده خودش در پورتال: نوبت، فرم‌ها، پیشرفت، محتوای آموزشی | ورود با OTP موبایل؛ بدون رمز |
| `admin` (شما) | پنل جداگانه سرور: tenants، لایسنس‌ها، متریک‌ها | خارج از اپ کلینیک |

### درس‌هایی که از نسخه 1 می‌گیریم (نبایدها)

| ضعف نسخه 1 | راه‌حل در v2 |
|---|---|
| احراز هویت localStorage جعلی | Auth واقعی: JWT+Refresh (کارمند) / OTP (بیمار) |
| یک اکانت برای همه | RBAC چندنقشی از migration اول |
| بدون Audit Log | audit_log append-only با hash-chain |
| ALTER TABLE با try/catch | Migration های نسخه‌دار Drizzle |
| API Key در URL کلاینت | کلید فقط در سرور؛ هدر x-goog-api-key |
| Python خارجی که در بیلد نبود | موتور ONNX داخلی + باندل امضاشده |
| i18n با ternary پراکنده | i18next با RTL-first از روز اول |
| صفر تست، صفر CI، حتی بدون Git | Vitest+Playwright+Actions؛ Git قبل از هر کدی |

---

## 2. مدل‌های استقرار

**یک کدبیس، دو مدل فروش، هر دو با قابلیت آفلاین:**

| | ☁️ Cloud (روی VPS ما) | 🏢 Self-Hosted (سرور مشتری) |
|---|---|---|
| داده | PostgreSQL ما، چند کلینیک روی یک DB (RLS ایزوله) | داخل کلینیک؛ هرگز خارج نمی‌شود |
| لایسنس | اشتراک، کنترل لحظه‌ای سرور | کلید امضاشده Ed25519 + Grace Period |
| پیام‌رسانی | Gateway ما (SMS/پیام‌رسان‌های ایرانی) | کلید API خودِ کلینیک در تنظیمات |
| پرداخت | درگاه ما (زرین‌پال/IDPay adapter) | درگاه خود کلینیک |
| بکاپ | شبانه رمزشده + offsite | فیچر داخلی اپ (S3/دیسک خودش) |
| بازار | کلینیک‌های کوچک/متوسط | کلینیک‌های بزرگ حساس به حریم بیمار |

هر دو مدل Docker Compose مشترک دارند: `api + postgres(pgvector) + minio + caddy + worker`.

---

## 3. معماری کلی سیستم

```
┌─ سطح بیمار ─────────────────────────────┐
│ Patient Portal (PWA قابل نصب)            │
│  رزرو آنلاین · فرم پیش‌ازمراجعه ·          │
│  قبل/بعد · مستندات آموزشی · یادآورها       │
└──────────────┬──────────────────────────┘
               │ HTTPS · OTP Auth
┌──────────────▼────────────────────────── VPS ─────────────────┐
│ Caddy (TLS) → NestJS API                                       │
│  ├─ Auth: JWT+Refresh کارمندان / OTP بیماران                   │
│  ├─ RBAC Guards · AuditLog Interceptor · Tenancy Middleware    │
│  ├─ Booking Engine (اسلات، تداخل، سیاست لغو)                   │
│  ├─ Aftercare Engine (توالی چندمرحله‌ای داده‌محور)              │
│  ├─ Consent & Forms Service                                    │
│  ├─ Billing Service (فاکتور/عضویت + درگاه adapter)             │
│  ├─ Sync API (/sync/push idempotent · /sync/pull?cursor=)      │
│  ├─ Licensing (صدور/ابطال توکن امضاشده Ed25519)                │
│  ├─ Media (presigned URL · chunk upload · EXIF strip)          │
│  ├─ AI Service: Adapter چندارائه‌دهنده (ADR-18) — PHI-sanitized    │
│  │    provider per-clinic از تنظیمات؛ پیش‌فرض = بدون AI خارجی       │
│  ├─ Insight API (Copilot RAG روی pgvector)                     │
│  ├─ Admin API                                                  │
│  └─ MCP Server (/mcp — Streamable HTTP · Tool Registry مشترک)   │
│                                                                │
│ BullMQ Workers                                                 │
│  ├─ Messaging Gateway ← adapter: Kavenegar/SMS.ir · Bale ·     │
│  │    Eitaa · Telegram Bot · WhatsApp Cloud API (fallback SMS) │
│  ├─ Media jobs (thumbnail/PDF/quality-check)                   │
│  ├─ ML Pipeline (Data Lake → Trainer → Eval Gate → Registry)   │
│  └─ Backup (pg_dump رمزشده + offsite)                          │
│                                                                │
│ PostgreSQL(+pgvector) · MinIO · Redis                          │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS/REST
┌──────────────▼───────────────────── کلاینت کلینیک ────────────┐
│ Web SPA (React+Vite) + پوسته Electron نازک (اختیاری)           │
│  UI: دیزاین‌سیستم Microscopy Premium + Framer Motion            │
│  Education Layer: Rive + Scalp Explorer 3D (R3F)               │
│  State: Zustand + TanStack Query · i18next RTL                 │
│ Local-First Core:                                              │
│  ├─ Local DB + Outbox + Sync Engine                            │
│  ├─ License Cache (امضاشده + Grace)                            │
│  ├─ ONNX Runtime (تحلیل همیشه لوکال)                           │
│  └─ Scribe لوکال (Whisper.cpp/WASM — نوت صوتی آفلاین)          │
└────────────────────────────────────────────────────────────────┘
```

**اصل طلایی:** تحلیل تصویر همیشه لوکال اجرا می‌شود. قطعی اینترنت = کاهش امکانات ابری، نه فلج شدن. Scribe صوتی هم آفلاین کار می‌کند (Whisper لوکال).

---

## 4. استک فناوری و تصمیم‌های کلیدی

| لایه | انتخاب | دلیل |
|---|---|---|
| Frontend | React 18 + TS + Vite | ادامه مهارت تیم؛ اکوسیستم |
| دیزاین‌سیستم | Tailwind + Radix سفارشی | پایه shadcn بدون قفل برند |
| انیمیشن | Framer Motion + Rive + React Three Fiber | جدول §11 |
| State/Data | Zustand + TanStack Query | کش/retry/invalidation |
| Backend | NestJS (Fastify) + Zod | Guard/DI برای RBAC-Audit |
| DB | PostgreSQL 16 + **pgvector** + Drizzle | RLS + جستجوی برداری تصویر/RAG در همان DB |
| Object Storage | MinIO (S3-compatible) | self-hosted هم دارد |
| صف | BullMQ + Redis | پیام/مدیا/ML/backup |
| Auth کارمند | JWT access(15m)+Refresh چرخشی | قابل ابطال |
| Auth بیمار | **OTP موبایل** (SMS gateway) + session محدود | بدون رمز؛ اصطکاک کم |
| CV/AI محلی | ONNX Runtime (WASM کلاینت / Node سرور) + YOLO/U-Net int8 | حذف Python؛ آپدیت مدل از راه دور |
| توضیح‌پذیری | Grad-CAM export به ONNX-adjacent artifact | اعتماد متخصص + تسریع Gold-label |
| ASR (Scribe) | whisper.cpp — native-first (Electron)، WASM فقط fallback سبک؛ مدل fine-tuned فارسی | آفلاین؛ صوت هرگز سرور نمی‌رود؛ کنترل کیفیت با WER-gate فارسی |
| AI ابری | **لایه Adapter چندارائه‌دهنده (ADR-18):** Gemini · OpenAI-compatible · مدل self-host روی VPS ما | افزودن provider = تنظیمات نه کد؛ ریسک تحریم/تک‌vendor حذف؛ پیش‌فرض = غیرفعال |
| پیام‌رسانی | **لایه Adapter**: Kavenegar/SMS.ir · Bale · Eitaa · Telegram Bot · WhatsApp Cloud API | ریسک تک‌کانال صفر؛ fallback زنجیره‌ای |
| PDF | @react-pdf/renderer یا Puppeteer worker | گزارش بالینی |
| Desktop | Electron نازک (بعداً ارزیابی Tauri) | وب اول |
| PWA | Workbox service worker (پورتال بیمار) | نصب بدون استور؛ آپدیت فوری |
| i18n + تقویم | i18next (fa پیش‌فرض) + Jalali-util واحد در packages/shared (ADR-19) | RTL-first؛ ذخیره UTC، نمایش شمسی |
| تست | Vitest + Playwright + k6 | از روز اول |
| CI/CD | GitHub Actions → Docker → SSH deploy | matrix کامل |

---

## 5. ساختار Monorepo

```
scalpai-v2/
├─ apps/
│  ├─ api/                 # NestJS backend (همه سرویس‌ها)
│  ├─ web/                 # SPA کلینیک
│  ├─ portal/              # Patient Portal (PWA — دامنه/مسیر جدا)
│  ├─ desktop/             # پوسته Electron نازک
│  └─ admin/               # پنل مدیریت شما
├─ packages/
│  ├─ shared/              # types + zod (قرارداد API/Sync/Education/Aftercare)
│  ├─ db/                  # schema Drizzle + migrations + seed
│  ├─ sync-client/         # Outbox/Sync سمت کلاینت
│  ├─ analysis-core/       # منطق نمره‌دهی مشترک
│  ├─ analysis-engine/     # بارگذار ONNX + پیش/پس‌پردازش + Grad-CAM overlay
│  ├─ education/           # Storyboard Mapper + موتور صحنه + Rive components
│  ├─ licensing/           # verify امضا + grace + ضدtamper ساعت
│  ├─ notify/              # Adapter های پیام‌رسانی + قالب‌سازی امن (PHI-safe)
│  └─ ui/                  # دیزاین‌سیستم + motion presets
├─ tooling/                # eslint/tsconfig/tailwind preset
├─ ops/                    # docker-compose، Caddyfile، backup/restore scripts
└─ docs/                   # این سند + ADR ها + OpenAPI spec
```

---

## 6. معماری داده و ERD

### 6.1 هسته (همه جداول business دارای `clinic_id`)

```sql
clinics(id, name, plan, status, consent_training bool default false,
        settings jsonb, created_at)
branches(id, clinic_id, name, address, phone)          -- چندشعبه از روز اول در schema

users(id, clinic_id, branch_id null, role owner|trichologist|receptionist,
      email, password_hash argon2id, last_login_at, revoked_at)

patients(id, clinic_id, first_name, last_name, phone, gender, birth_date,
         notes_encrypted, tags text[],
         created_by, created_at, updated_at, deleted_at)
         -- phone: UNIQUE(clinic_id, phone) WHERE deleted_at IS NULL (partial)

services(id, clinic_id, name, duration_min, buffer_after_min,
         price, active bool)                            -- رزرو/فاکتور/aftercare بر اساس سرویس

sessions(id, clinic_id, patient_id, staff_id, service_id, start_at, end_at,
         status booked|completed|cancelled|no_show,
         source staff|patient_portal|bot,               -- منبع ثبت
         notes, created_at, updated_at)                 -- جایگزین date/time نسخه1

gallery_items(id, clinic_id, patient_id, session_id null,
              storage_key, thumb_key, mime, captured_at, body_region,
              exif_stripped bool, upload_state pending|done,
              quality jsonb,                            -- کنترل کیفیت: blur/light/distance
              sha256, created_at)

analyses(id, clinic_id, patient_id, session_id, gallery_item_id,
         type local_onnx|gemini|manual, result jsonb,
         expert_review jsonb null,                      -- Gold-label §10
         model_version, explain_map_key null,           -- Grad-CAM overlay
         confidence_avg, created_by, created_at)

treatment_plans(id, clinic_id, patient_id, items jsonb, start_date, review_intervals jsonb)

consents(id, clinic_id, patient_id, service_id, template_version,
         signature_payload, signed_at, signed_from_ip, revoked_at)   -- رضایت‌نامه دیجیتال

audit_log(id, clinic_id, user_id, action, entity, entity_id,
          meta jsonb, at, prev_hash, row_hash)          -- append-only زنجیره‌ای
```

### 6.2 تعامل با بیمار (پورتال + Aftercare)

```sql
portal_users(id, clinic_id, patient_id, phone, verified_at,
             otp_hash null, otp_expires_at null, last_login_at)

appointments(id, clinic_id, branch_id, patient_id, staff_id, service_id,
             start_at, end_at, status pending|confirmed|cancelled|completed,
             intake_form_response jsonb null,             -- فرم پیش‌ازمراجعه
             session_id null,                             -- پس از check-in پر می‌شود
             created_source portal|staff|bot)
-- رابطه نوبت↔جلسه: appointment تأییدشده پورتال هنگام check-in به session تبدیل
-- می‌شود (session_id ثبت می‌شود)؛ جلسات حضوری/پرسنلی مستقیم session می‌سازند.

intake_forms(id, clinic_id, service_id null, schema jsonb)  -- سازنده فرم

aftercare_sequences(id, clinic_id, service_id, steps jsonb)
-- step: {offset_days, channel sms|bale|eitaa|telegram|whatsapp,
--        template_id, condition jsonb null, on_reply jsonb null}
aftercare_enrollments(id, clinic_id, patient_id, sequence_id, session_id,
                      started_at, status running|paused|done)

message_log(id, clinic_id, patient_id, channel, template_id,
            body_sanitized, status queued|sent|delivered|failed|replied,
            provider_msg_id, sent_at)
inbound_messages(id, clinic_id, patient_id null, channel, body,
                 concern jsonb null,                     -- تشخیص هوشمند نگرانی
                 reviewed_by null, reviewed_at null)
```

### 6.3 تجاری (فاکتور / عضویت / انبار — حداقلی اما کامل)

```sql
products(id, clinic_id, sku, name, unit_price, stock_qty, min_stock)
invoices(id, clinic_id, patient_id, total, discount,
         payment_status unpaid|partial|paid, gateway_ref null, issued_at)
invoice_items(id, invoice_id, service_id null, product_id null,
              title, qty, unit_price, total)   -- ردیف رابطه‌ای به‌جای jsonb؛ گزارشگری/مالیات
memberships(id, clinic_id, patient_id, plan_name, sessions_total,
            sessions_used, expires_at, price_paid)

-- موتور فروش چندپلنه (§9.1)
plans(id, code unique, name jsonb, price, interval month|year,
      limits jsonb)   -- {max_users, storage_mb, analyses_per_month, branches}
plan_features(plan_id, feature key)   -- portal|aftercare|scribe|api|ml_updates|...
entitlements(clinic_id pk, plan_id, overrides jsonb null, current_period_end)
usage_counters(clinic_id, metric, period_start, value)  -- metered usage
```

### 6.4 پیگیری ضایعه و جستجو

```sql
lesions(id, clinic_id, patient_id, body_region,
        first_seen_item_id, status active|monitoring|resolved)
lesion_observations(id, lesion_id, gallery_item_id, bbox jsonb,
                    metrics jsonb, change_score numeric, captured_at)
-- Evolution Tracker: خط زمانی هر lesion بین جلسات + امتیاز تغییر

-- pgvector:
image_embeddings(gallery_item_id pk, embedding vector(512))  -- جستجوی تصویر مشابه
```

### 6.5 Sync و ML

```sql
mutations(id bigserial, clinic_id, user_id, client_mutation_id uuid unique,
          entity, op, payload jsonb, server_seq bigint, at)
model_bundles(id, version, task, storage_key, sha256, ed25519_signature,
              eval_metrics jsonb, status candidate|released|rolled_back)
training_samples(id, image_key anon, label_silver jsonb, label_gold jsonb null,
                 reviewed_by null, consent_verified bool, split train|val|test)

-- کلاینت (Local DB): outbox · sync_state · license_cache (مطابق v1.0 سند)
```

**قواعد:** soft-delete با `deleted_at` · unique های جداول business همیشه partial با `WHERE deleted_at IS NULL` · جستجوی متنی بیماران (name/phone) با pg_trgm و فقط از Repository · فیلدهای حساس AES-GCM · هیچ query بدون `clinic_id`.

---

## 7. چندمستأجری و ایزوله‌سازی (Multi-Tenancy)

چهار لایه دفاعی — هیچ کلینیکی حتی با سوءاستفاده دستی از API به داده tenant دیگر نمی‌رسد:

1. **JWT claim**: `{sub, clinicId, role}` برای کارمندان؛ توکن بیمار `{patientId, clinicId, scope:"portal"}` جدا و محدودتر است
2. **Repository Layer**: هر query اجباراً scoped به clinic خودش؛ نوشتن query بدون آن غیرممکن
3. **PostgreSQL RLS** (ضامن نهایی):

```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patients
  USING (clinic_id = current_setting('app.clinic_id')::uuid);
-- هر تراکنش: SET LOCAL app.clinic_id = $1
```

4. **Storage**: مسیر اجباری `bucket/clinic-{id}/...` + فقط presigned URL با TTL کوتاه

اضافه‌ها: rate-limit per-tenant · audit per-tenant · Self-Hosted همان اسکیما با ۱ tenant (صفر انشعاب کد).

---

## 8. معماری Offline-First و Sync

الگوی Local-First + Outbox + Cursor (بدون CRDT — مقیاس ما تک‌کلینیک است):

```
آنلاین:  UI ──► API ──► پاسخ ──► Local DB cache
آفلاین:  UI ──► Local DB + رکورد Outbox
بازگشت:  POST /sync/push {mutations[], clientMutationId}  (idempotent)
         GET  /sync/pull?cursor=N                          (delta)
تعارض:   سیاست per-entity (بولت‌های پایین) — پیش‌فرض LWW با updatedAt سروری
تصاویر:  chunk/resume با presigned URL تا state=done
```

- **اولویت sync:** mutations کوچک اول، سپس تصاویر بزرگ در background
- **سیاست تعارض per-entity:** `analyses` و نوت‌ها = append-only (هرگز overwrite) · `patients`/`treatment_plans` = field-level LWW با version check (push با نسخه کهنه → 409 + pull مجدد) — جدول سیاست جزو packages/shared است
- **نسخه قرارداد sync:** هر mutation دارای `schemaVersion`؛ سرور ۲ نسخه اخیر قرارداد را می‌پذیرد؛ migration سرور هرگز کلاینت آفلاین را نمی‌شکند (expand→migrate→contract شامل قرارداد sync هم هست)
- **Scribe آفلاین:** صوت → متن کاملاً لوکال (whisper.cpp)؛ فقط نوت نهایی sync می‌شود — حریم خصوصی + کار بدون اینترنت
- **متریک موفقیت:** ثبت بیمار+جلسه+تحلیل آفلاین کامل؛ sync پس از ۱۰ دقیقه قطعی بدون خطا/دوباره‌کاری

---

## 9. سیستم لایسنس بدون قفل سخت‌افزاری

```
صدور (آنلاین):  login → JWT لایسنس امضاشده Ed25519:
                {clinicId, plan, features[], issuedAt, expiresAt, graceDays:14}
اعتبارسنجی:     verify لوکال با public-key توکار — بدون تماس سرور
آفلاین:         داخل اعتبار+grace → فیچرهای پلن فعال
بعد از grace:    read-only تا اتصال مجدد
ضد تقلب ساعت:   last_seen_clock مونوتونیک → پرش عقب = flag
ابطال:          TTL کوتاه (تجدید ۷ روزه) → قطع حداکثر ۷ روزه
Self-Hosted:    license file جدا + heartbeat اختیاری هفتگی
```

**Features قابل کنترل در پلن:** تعداد کاربران · حجم گالری · تحلیل ابری AI (اختیاری — provider منتخب، ADR-18) · گزارش PDF سفارشی · **Patient Portal** · **Aftercare Engine** · **AI Scribe** · دریافت مدل ML جدید · **چندشعبه** · **Open API/webhooks** · **سرور MCP (mcp_api — پیش‌فرض فعال)**.

### 9.1 Plans & Entitlements — موتور فروش چندپلنه

تفکیک مهم: لایسنس (بالا) «ضدجعل» است؛ لایه Entitlement «چه چیزی قابل فروش است».

| مؤلفه | نقش |
|---|---|
| `plans` + `plan_features` (DB) | کاتالوگ پلن‌ها: Starter/Growth/Enterprise با سهمیه‌ها (کاربران، حجم گالری، تحلیل/ماه، شعبه) — **پلن جدید = رکورد جدید، بدون deploy** |
| EntitlementService | تک‌منبع حقیقت سرور: `resolve(clinicId) → {features[], quotas, usage}` |
| Enforcement | دکوریتور `@RequireFeature('portal')` روی endpoint ها + چک سهمیه قبل از آپلود/تحلیل/رزرو |
| Metering | `usage_counters` توسط worker ها افزایش می‌یابد (MB آپلود، تعداد تحلیل، پیام ارسالی) |
| تغییر پلن | ارتقا فوری · کاهش در پایان دوره · تعامل با Grace Period |

Self-Hosted همان موتور را با `plan = license` استفاده می‌کند (صفر انشعاب کد).

---

## 10. ماژول یادگیری ماشین — Data Flywheel

**اصل:** آموزش فقط روی VPS ما؛ روی سیستم مشتری فقط inference (ONNX).

### 10.1 کنترل کیفیت تصویر — دروازه ورود داده

هر تصویر قبل از ذخیره/تحلیل چک کیفیت می‌شود (CV کلاسیک، لوکال و فوری):
`blur (Laplacian var)` · `نور` · `کادربندی/فاصله` → مردود = پیام «عکس مجدد بگیرید» همان لحظه.
**دو برد هم‌زمان:** گزارش بالینی قابل‌اتکا + داده تمیز برای Flywheel (الگوی DermEngine Smart QC، اما آفلاین).

### 10.2 چرخه هشت‌مرحله‌ای

```
① جمع‌آوری   تحلیل + تصحیح متخصص → training_samples
              بی‌نام‌سازی اجباری · فقط clinics با consent_training=true
② برچسب      silver = خروجی خام AI · gold = تصحیح متخصص (ارزش اصلی)
③ Active     موارد low-confidence اولِ صف بازبینی؛ Grad-CAM کمک می‌کند
   Learning    متخصص سریع بفهمد مدل کجا را دیده
④ آموزش      job دوره‌ای — GPU ابری لحظه‌ای، نه دائمی
⑤ Eval Gate  انتشار فقط با برد روی test-set ثابت
⑥ انتشار     باندل ONNX int8 + امضای Ed25519 + version
⑦ توزیع      دانلود خودکار کلاینت آنلاین · last-known-good برای rollback
⑧ اجرا       همیشه لوکال = «API آفلاین خودمان» که مدام هوشمندتر می‌شود
```

### 10.3 جستجوی تصویری اطلس

Embedding هر تصویر گالری (مدل CLIP-like کوچک → `vector(512)` در pgvector). متخصص روی هر تصویر «مشابه‌های تأییدشده» را می‌بیند — الگوی DermEngine Advanced Search، اما از داده خودمان؛ بعداً پایه Copilot چندوجهی.

### 10.4 توضیح‌پذیری (Explainability-first)

هر نتیجه مدل با heatmap Grad-CAM (`analyses.explain_map_key`). سه استفاده: اعتماد متخصص · تسریع بازبینی Gold · نمایش به بیمار («مدل دقیقاً این ناحیه را دیده»).

### 10.5 تسک‌ها به ترتیب واقع‌گرایانه

| فاز | تسک | معیار موفقیت |
|---|---|---|
| B (ماه ۶-۱۲) | شمارش فولیکول/تراکم per cm² (YOLO) | MAE < آستانه کلینیکی نسبت به شمارش متخصص |
| C (سال ۲) | Segmentation پوست سر/مو (U-Net/SAM-tuned) | Dice > 0.85 |
| D (سال ۲+) | طبقه‌بندی Norwood + تشدید خودکار | Agreement با متخصص ≥ 80% |

Provider ابری AI (فقط در صورت فعال‌سازی — §4/ADR-18) تا پایان C فقط متن توضیح/توصیه تولید می‌کند؛ هدف نهایی حذف کامل وابستگی به هر provider خارجی است.

---

## 11. لایه آموزش سه‌بعدی بیمار (Education Layer)

بعد از هر تحلیل، بسته به مشکل واقعی بیمار صحنه بصری/سه‌بعدی پخش می‌شود (زوم زیر پوست → برش لایه‌ها → نمایش فولیکول و مشکلش).

**معماری داده‌محور — Storyboard Mapper** (انیمیشن هاردکد نمی‌شود؛ storyboard = JSON):

```jsonc
{
  "androgenic_alopecia": {
    "scene": "follicle-cross-section",
    "cameraPath": ["zoom_skin", "cut_layers", "focus_follicle"],
    "highlight": "miniaturization",
    "severityFrom": "result.hairLoss.score",
    "narration": { "fa": "...", "en": "..." },
    "reviewedBy": "Dr. X — 2026-08"     // اعتبار علمی الزامی
  }
}
```

| فاز | فناوری | محتوا |
|---|---|---|
| E1 | Rive state-machine | ۸ وضعیت رایج × ۳ شدت — واکنش زنده به اسکور بیمار |
| E2 | R3F «Scalp Explorer» | یک مدل آناتومیک مشترک + مسیر دوربین per-condition؛ تعاملی |
| E3 | شخصی‌سازی کامل | دوربین روی bbox همان lesion · روایت صوتی · snapshot در PDF |

**نگاشت به نقشه راه:** E1 → فاز ۴ · E2 → فاز ۶ · **E3 → فاز ۷** (پیش‌نیاز: bbox ضایعه از Evolution Tracker فاز ۶)

**Storyboard های E1:** ریزش الگویی · Telogen Effluvium · شوره/سبورئیک · فولیکولیت · چربی بیش‌ازحد · خشکی · قرمزی · انسداد فولیکول.

**قواعد سخت:** تأیید علمی هر storyboard · دیسکلیمر دائمی «آموزشی است، جایگزین تشخیص نیست» · Skip همیشه ممکن + `prefers-reduced-motion` · fallback بدون WebGL · lazy-load موتور 3D · خرید مدل آماده، بودجه روی texture نه modeling.

**اتصال به پورتال بیمار:** نسخه سبک storyboard ها در Patient Portal هم پخش می‌شود — بیمار در خانه دوباره می‌بیند مشکلش چه بود.

---

## 12. زبان طراحی UI/UX منحصربه‌فرد

**کانسپت: «Microscopy Premium»** — الهام از دنیای میکروسکوپ/تریکوسکوپی:

- تم Dark پیش‌فرض (`#0B0F14`) + accent سبز-نعنایی پزشکی + amber هشدار؛ Light بالینی برای اتاق روشن
- عمق ظریف همه‌جا: glassmorphism کنترل‌شده + سایه لبه‌دار؛ پارالاکس ملایم فقط داشبورد
- **Hero:** Scalp Map زنده — نقشه سر بیمار با heatmap تراکم/قرمزی از آخرین تحلیل
- Micro-interactions: count-up اعداد، stagger reveal نتایج، count-up متریک‌ها
- **Signature Moment:** پایان تحلیل → ترنزیشن سینمایی «ورود به زیر پوست» → Scalp Explorer با یافته‌های همان بیمار
- RTL-first با logical properties؛ وزیرمتن + Inter fallback؛ کنتراست AA؛ touch ≥44px
- **Jalali-first (ADR-19):** ذخیره همیشه UTC · نمایش شمسی فقط از util واحد packages/shared · ارقام فارسی در UI · خروجی PDF/گزارش نیز شمسی

**پورتال بیمار (لحن جدا):** روشن‌تر، دوستانه‌تر، برند کلینیک (white-label رنگ/لوگو)، موبایل‌اول — بیمار نباید حس «نرم‌افزار اداری» کند.

---

## 13. امنیت و انطباق

| حوزه | تصمیم |
|---|---|
| Transport | TLS اجباری (Caddy/Let's Encrypt) + HSTS |
| رمز کارمند | Argon2id + قفل تدریجی brute-force |
| نشست بیمار | OTP: عمر ≤۲ دقیقه · حداکثر ۵ تلاش · قفل تدریجی شماره · scope محدود به patient_id خودش · ریسک SIM-swap مستند و پایش شود |
| Auto-lock | قفل اپ کلینیک پس از N دقیقه بی‌کاری (پیش‌فرض ۱۰) |
| At-rest | Volume encryption + فیلدهای حساس AES-GCM |
| Uploads | EXIF strip اجباری · magic-byte check · سقف حجم · quality-gate §10.1 |
| PHI در پیام‌رسانی | **قانون طلایی: داده حساس هرگز در متن پیام نیست** — فقط یادآوری/لینک توکن‌دار منقضی‌شونده؛ message_log فقط نسخه sanitize |
| صوت Scribe | ضبط فقط با opt-in صریح؛ audio ذخیره/ارسال نمی‌شود؛ پردازش لوکال و discard فوری |
| Audit | append-only hash-chain + anchor هفتگی آخرین hash به storage جدا از DB — دستکاری حتی با دسترسی DB قابل تشخیص · شامل export ها |
| Backup | pg_dump رمزشده شبانه + WAL + offsite؛ drill سالانه restore واقعی |
| Secrets | فقط env/Vault · چرخش نیمه‌سالانه · هیچ secret در ریپو/لاگ |
| پنل Admin | 2FA اجباری (TOTP) + IP allowlist · دامنه/مسیر کاملاً جدا از اپ کلینیک |
| Privacy | consent_training opt-in · حق export/delete بیمار · white-label data residency برای Self-Hosted |
| Dependencies | Dependabot + `pnpm audit` در CI + pin نسخه‌ها |

---

## 14. مهندسی کیفیت: تست، CI/CD، انتشار

### 14.1 لایه‌های تست
- **Unit (Vitest):** analysis-core · sync conflict · licensing verify · RBAC guards · aftercare step engine — پوشش ≥70% روی پکیج‌های logic
- **Integration:** API با **Postgres واقعی در CI** (docker-compose روی runner — نه mock؛ volume تازه هر run) · MinIO/Redis با testcontainers؛ contract-test قرارداد sync و adapter های پیام‌رسانی (با سرور mock)
- **E2E (Playwright):** مسیرهای حیاتی: ثبت بیمار → جلسه → آپلود → تحلیل → گزارش؛ سناریوی آفلاین→sync؛ **رزرو آنلاین بیمار**؛ شبیه‌سازی توالی Aftercare (زمان مجازی) — سناریوهای شکننده شبکه (throttle/offline) در nightly نه هر push
- **Load (k6):** booking هم‌زمان + صف پیام‌رسانی — اجرای scheduled شبانه

### 14.2 CI Pipeline ابری (GitHub Actions)

```
on: pull_request  +  push:main
├─ pnpm install (cache + filter)
├─ docker compose up -d --wait        ← Postgres واقعی، volume تازه هر run
├─ pnpm db:migrate                    ← اثبات خودکار: همه migration ها از DB خالی تمیز اجرا می‌شوند
├─ typecheck · lint · unit
├─ integration (RLS/cross-tenant روی Postgres واقعی)
├─ conformance run                    ← §14.3
├─ graph --check                      ← §14.4
├─ build + bundle-budget (<300KB gzip)
└─ upload artifacts (reports) — if: always()
```

قواعد ثابت:
- هر گزارش CI فقط **artifact** است — کامیت گزارش به main ممنوع (حلقه build می‌سازد)
- Migration-from-empty روی هر push = ضمانت اجرایی expand→migrate→contract
- Mirror registry برای ایمیج‌های Docker (ریسک تحریمی §16)

### 14.3 Conformance Harness (ADR-21)

قوانین engineering-rules تا جای ممکن **ماشینی** می‌شوند — هر قانون = یک چکر + fixture های عمدیِ نقض + self-test خودش (هر قانون باید نقض fixture خودش را بگیرد، وگرنه چکر بی‌ارزش است):

| Rule | چه چیزی را می‌گیرد |
|---|---|
| tenant-safety | جدول business بدون clinic_id یا بدون RLS ENABLE+FORCE |
| db-access | import مستقیم pg/drizzle خارج از packages/db · query بدون `SET LOCAL app.clinic_id` |
| phi-logs | الگوهای PHI (نام/تلفن/توکن) در statements لاگ |
| feature-gate | endpoint که فیچر gated را سرو کند بدون @RequireFeature |
| error-contract | پاسخ خطا خارج از شکل ثابت `{code,message,details?}` |
| secrets | کلید/token literal در سورس |

- استثنا فقط از طریق `exceptions.json` — هر ورود **ارجاع ADR الزامی**؛ ورودی بدون ADR = شکست build
- خروجی `conformance-report.md` فقط artifact — هرگز commit نمی‌شود

### 14.4 Project Graph (ADR-22)

ابزار parse مکانیکی از سورس (بدون دست‌نویسی، بدون LLM): «چه وجود دارد» — توصیفی است و داوری نمی‌کند؛ داوری با هارنس §14.3:

| گره | منبع parse |
|---|---|
| packages/apps + یال‌های وابستگی workspace | package.json ها + tsconfig paths + import ها |
| جداول: clinic_id / RLS / FORCE / policies | migration های Drizzle (SQL خروجی) |
| endpoints + @RequireFeature + @Roles + audit-flag | کنترلرها و guard ها |
| MCP Tool Registry (tool + field-whitelist) | packages/shared registry |
| رجیستری ADR | docs/adr |
| موجودی تست‌ها به تفکیک package/لایه | فایل‌های spec |

خروجی دوگانه: `PROJECT_GRAPH.md` + `project-graph.json` · `--check` در CI (stale = fail) · `--since <ref>` برای diff ساختاری بین فازها (ورود گزارش PROGRESS.md). گراف همچنین context ارزان و دقیق برای session های کدزنی AI است.

### 14.5 سیاست Merge — دو لاین (ADR-23)

| لاین | محدوده | فرآیند |
|---|---|---|
| **Fast** | docs/* · PROGRESS · تغییرات صرفاً متنی | push مستقیم به main |
| **Gated** | packages/db · apps/api · **apps/web · apps/portal** · sync-client · licensing · notify · shared (MCP Registry) | branch ← CI کامل سبز ← **auto-merge خودکار** (بدون کلیک انسانی) |

- Branch protection روی main با required checks (integration/conformance/graph/bundle-budget)
- **دو استثنای رسمی و لاگ‌شونده:** (۱) Hotfix با دستور صریح مالک — دلیل در completion file ثبت شود (۲) دو اجرای متوالی CI fail صرفاً به‌دلیل زیرساخت، برای تغییر بلاک‌کننده — با ثبت در گزارش
- منطق: reviewer انسانی دوم وجود ندارد ← تست ابری سنگین باید **دروازه قبل از land** باشد نه زنگ خطر بعد از آن
- gate-review پایان هر فاز (DoD پلی‌بوک‌ها) = بازبینی انسانی دوره‌ای

### 14.6 انتشار و عملیات
- **انتشار:** semver · changelog خودکار · blue-green ساده با سوییچ Caddy · migration های expand→migrate→contract
- **RTO/RPO هدف:** restore ≤ ۴ ساعت · ازدست‌رفتن داده ≤ ۲۴ ساعت (Cloud)؛ نتیجه drill سالانه مکتوب و قابل ممیزی
- **مشاهده‌پذیری:** pino structured (بدون PHI!) + Sentry + متریک startup/IPC/sync-lag + healthcheck

---

## 15. نقشه راه اجرا (به‌روزشده با یافته‌های §18)

| فاز | زمان | محتوا | خروجی قابل‌فروش |
|---|---|---|---|
| **0 — آماده‌سازی** | روز ۱-۲ | git init · آرشیو legacy · تأیید این سند · ADR ها | ریپو تمیز |
| **1 — ستون فقرات** | هفته ۱-۴ | Monorepo + API هسته (Auth/RBAC/Tenancy/RLS/Audit) + CRUD بیمار/جلسه + دیزاین‌سیستم پایه + **هسته Plans/Entitlement (§9.1)** + CI | نسخه آنلاین ساده + فروش پلن‌ها از روز اول |
| **2 — رسانه و تحلیل** | هفته ۵-۸ | گالری + آپلود chunk + thumbnail + **کنترل کیفیت تصویر (A4)** + موتور ONNX لوکال + صفحه نتیجه + i18next + Auto-lock | MVP واقعی برای pilot |
| **3 — آفلاین و لایسنس** | هفته ۹-۱۲ | Local DB + Outbox Sync + آپلود resume + Licensing (Ed25519+grace) + Compose Self-Hosted + بکاپ داخلی + **رضایت‌نامه دیجیتال (A3)** + PWA manifest | فروش هر دو مدل شروع می‌شود |
| **4 — تجربه** | ماه ۴-۵ | Education E1 (Rive×۸) + گزارش PDF + Scalp Map داشبورد + پوسته Electron + guided capture (پرامپت عکس هر جلسه) | تمایز بصری کامل |
| **5 — رشد تجاری (Aftercare-first)** | ماه ۵-۷ | **5a:** **Aftercare Engine چندکاناله + یادآور no-show + inbound inbox** + فاکتور/POS پایه (invoice_items رابطه‌ای) + درگاه پرداخت ایرانی — بدون نیاز به نصب چیزی توسط بیمار → سپس **5b:** **Patient Portal (PWA): رزرو آنلاین + فرم پیش‌ازمراجعه + before/after بیمار** پس از بازخورد واقعی کلینیک‌ها از 5a | چرخه ارتباط و درآمد کلینیک وابسته به ما می‌شود؛ تمایزی که در بازار فارسی‌زبان بی‌رقیب است |
| **6 — هوش** | ماه ۶-۱۲ (موازی با 5) | Data Lake + expert-review UI + Active Learning queue + اولین مدل فولیکول‌شمار + Grad-CAM (B10) + Scalp Explorer 3D (E2) + Evolution Tracker سطح ضایعه (A5) + جستجوی تصویری اطلس (A6) | «موتور خودمان» متولد می‌شود |
| **7 — بلوغ** | سال ۲ | Segmentation/Norwood + AI Scribe (B7) + Copilot RAG (B9) + ربات پذیرش پیام‌رسان (B8) + عضویت/انبار کامل + چندشعبه UI + Open API/webhooks + سرور MCP (ADR-20) + Education E3 شخصی‌سازی آموزش (دوربین روی ضایعه + روایت صوتی + snapshot در PDF؛ نیازمند bbox فاز ۶) + حذف تدریجی AI ابری + ارزیابی موبایل native | سودآوری مقیاس‌پذیر |

**قید سخت:** هیچ فیچر Tier-B (§18) قبل از پایان فاز ۵ شروع نمی‌شود — جلوگیری از scope creep.

---

## 16. ریسک‌ها و راهکارها

| ریسک | احتمال | اثر | راهکار |
|---|---|---|---|
| پیچیدگی sync و باگ داده | متوسط | بحرانی | LWW+idempotent ساده · contract-test · telemetry sync-lag · بدون CRDT تا اثبات نیاز |
| قطعی VPS برای کلاینت‌های Cloud | متوسط | زیاد | آفلاین‌بودن ذات محصول · status page · restore-drill |
| **وابستگی به کانال پیام‌رسان** (فیلترینگ/تغییر API) | زیاد | متوسط | لایه Adapter چندکاناله + fallback خودکار به SMS + صف retry |
| Gold data کم (عدم مشارکت متخصص) | زیاد | زیاد | UX یک‌ثانیه‌ای تأیید/رد · گزارش «سهم شما در دقت مدل» · Grad-CAM برای سرعت بخشیدن بازبینی |
| مدل ML ضعیف‌تر از انتظار | متوسط | متوسط | Eval Gate · heuristic fallback ابدی · وعده تجاری گره نمی‌خورد به مدل اول |
| نگرانی حریم داده کلینیک‌ها | زیاد | زیاد | Self-Hosted · consent شفاف · بی‌نام‌سازی قابل‌اثبات · PHI-safe messaging |
| Scope creep (۲۱ فیچر جدید) | زیاد | زیاد | قید فاز §15 · فیچرهای Tier-B فقط بعد از فاز ۵ · هر فیچر معیار خروج دارد |
| استقبال پایین از پورتال بیمار | متوسط | متوسط | شروع با Aftercare یک‌طرفه (بدون نیاز به نصب چیزی از بیمار) · لینک OTP بدون رمز |
| کیفیت ASR فارسی whisper کوچک (WER بالا / hallucination) | زیاد | متوسط | native-first (نه WASM مرورگر) · مدل fine-tuned فارسی · WER-gate روی test-set فارسی داخلی قبل انتشار · Scribe همیشه «پیش‌نویس» است نه نهایی |
| تحریم سرویس‌های SaaS زیرساختی (Sentry/Docker Hub/HuggingFace) | متوسط | متوسط | جایگزین self-host/mirror از روز اول (GlitchTip · registry mirror · HF mirror) · فهرست جایگزین‌ها در ops/ |
| pre-approval قالب‌های SMS خدماتی ایرانی | زیاد | کم | قالب‌ها static و عمومی (PHI-safe ذاتاً) · ثبت زودهنگام قالب‌ها نزد اپراتور · متغیرها فقط نام/تاریخ/لینک |
| پرامپت‌اینکشن / سوءاستفاده از agent های MCP | متوسط | زیاد | مرز امنیت در RLS/Repository نه پرامپت · tools فقط-خواندنی v1 · field-whitelist خروجی · دو هویت + audit هر call · rate-limit دوگانه |

---

## 17. خلاصه ADR ها

| # | تصمیم | جایگزین ردشده | دلیل |
|---|---|---|---|
| 1 | معماری Client–Server با Local-First | دسکتاپ تماماً آفلاین مثل v1 | لایسنس، RBAC، sync، مدل درآمدی |
| 2 | NestJS + PostgreSQL + Drizzle | Express/Prisma/Mongo | Guard/DI؛ RLS فقط Postgres |
| 3 | ایزوله‌سازی چهارلایه (JWT+Repo+RLS+Storage) | DB جدا per tenant | هزینه عملیاتی؛ مسیر ارتقا باز |
| 4 | Outbox + Cursor (LWW + سیاست تعارض per-entity §8) | CRDT / PowerSync خریداری | مقیاس تک‌کلینیک؛ مالکیت کامل؛ debug-پذیر — شرط بازبینی: spike ۳ روزه مقایسه با PowerSync self-host قبل از شروع فاز ۳ |
| 5 | لایسنس Ed25519 + Grace 14d | قفل سخت‌افزاری/dongle | UX بهتر؛ ضدجعل کافی |
| 6 | ONNX Runtime دوطرفه | Python جانبی مثل v1 | باگ توزیع v1؛ باندل امضاشده آپدیت‌پذیر |
| 7 | ML فقط سرور، توزیع وزن به کلاینت | آموزش روی دستگاه مشتری | کنترل IP؛ سخت‌افزار مشتری نامطمئن |
| 8 | Education = Storyboard JSON + موتور مشترک | انیمیشن هاردکد per-condition | توسعه‌پذیری؛ شخصی‌سازی از داده واقعی |
| 9 | Web-first + پوسته Electron نازک + PWA بیمار | دسکتاپ rich مثل v1 | توزیع/آپدیت بی‌دردسر |
| 10 | Git + CI از روز صفر | ادامه بدون VCS مثل v1 | شرط بقای پروژه |
| **11** | **pgvector برای جستجوی تصویری و RAG** | Elasticsearch/Qdrant جدا | یک DB کمتر؛ مقیاس ما کافی است |
| **12** | **لایه Adapter چندکاناله پیام‌رسانی** (Kavenegar/Bale/Eitaa/Telegram/WhatsApp) | اتصال مستقیم یک سرویس | ریسک فیلترینگ/تغییر API؛ fallback زنجیره‌ای |
| **13** | **Auth بیمار = OTP موبایل** | رمز عبور برای بیمار | اصطکاک صفر؛ شماره موبایل identity طبیعی کلینیک است |
| **14** | **Aftercare Engine داده‌محور (توالی JSON)** | قالب‌های ایمیل/SMS ثابت مثل رقبا | شکاف اعلام‌شده بازار §18 — تمایز اصلی ما |
| **15** | **Consent دیجیتال first-class متصل به سرویس/جلسه** | فرم کاغذی/PDF جدا | الزام حقوقی؛ Zenoti/Pabau آن را core می‌دانند |
| **16** | **Explainability-first در همه مدل‌ها (Grad-CAM)** | خروجی جعبه‌سیاه | اعتماد متخصص · تسریع Gold-label · محتوای آموزشی |
| **17** | **Plans/Entitlements داده‌محور (پلن = رکورد DB)** | هاردکد پلن‌ها در کد | فروش پلن جدید بدون deploy · enforcement مرکزی با Guard/Metering (§9.1) |
| **18** | **AI Service = Adapter چندارائه‌دهنده (Gemini/OpenAI-compatible/self-host) — PHI-sanitize قبل از هر provider ابری؛ پیش‌فرض غیرفعال** | وابستگی ثابت به یک vendor (Gemini) | ریسک تحریم/قطعی/تک‌برد حذف؛ افزودن provider = تنظیمات نه کد؛ حریم خصوصی مستقل از vendor |
| **19** | **Jalali-first: ذخیره UTC · نمایش شمسی فقط از util واحد shared** | تاریخ میلادی پیش‌فرض | الزام UX بازار هدف · جلوگیری از فرمت‌های پراکنده |
| **20** | **سرور MCP با Tool Registry واحد (zod→schema) — Copilot داخلی و bot ها client همان Registry؛ مرز امنیت در RLS/Repository؛ دو هویت در هر call؛ پیش‌فرض فعال per-clinic** | چت‌بات اختصاصی + OpenAPI خام | هر کلاینت AI بدون integration وصل می‌شود؛ نصف کد برای B9/B8؛ audit یکنواخت؛ تمایز «AI-native» بازار فارسی |
| **21** | **Conformance Harness — قوانین engineering-rules به‌صورت ماشینی با fixture/self-test؛ استثنا فقط با ADR در exceptions.json** | قوانین فقط به‌صورت مستندات prose | قانون کاغذی قابل اجرا نیست؛ کدزنی AI بدون گارد ماشینی منحرف می‌شود |
| **22** | **Project Graph مکانیکی (parse از سورس · خروجی md+json · --check در CI)** | مستندسازی دستی ساختار پروژه | سند نثرمحور drift می‌کند؛ گراف همچنین context ارزان برای عامل کدزن است |
| **23** | **سیاست Merge دو لاین: Fast (docs) / Gated (داده‌محور) — auto-merge بعد از CI سبز؛ گزارش CI فقط artifact** | PR اجباری برای همه، یا push آزاد برای همه | تیم تک‌نفره: تشریفات PR بی‌ارزش است مگر تست ابری قبل از land شدن اجرا شود |
| **24** | **توسعه لوکال با PostgreSQL 17 native — Docker فقط CI/استقرار** | نصب Docker Desktop در فاز توسعه | محدودیت منابع سیستم؛ env یکسان (`DATABASE_URL`) هر دو مسیر را پوشش می‌دهد |

---

## 18. تحلیل شکاف قابلیت‌ها با بهترین‌های دنیا

> منابع: Pabau · Zenoti · Fresha · NextMotion · DermEngine/MetaOptima · FotoFinder · Dermi Atlas · LumoScanner · Mentera.ai
>
> 🔥 **یافته طلایی (نسخه اصلاح‌شده):** ابزارهای purpose-built aftercare در جهان تازه شکل گرفته‌اند (Pabau Workflows پایه‌ای دارد؛ PostCare و مشابه‌ها نوپایند) اما هیچ‌کدام Aftercare بالینی چندمرحله‌ای را core نمی‌دانند — و مهم‌تر: **در بازار فارسی‌زبان هیچ رقیبی این سه را ندارد:**
> **۱) توالی Aftercare چندمرحله‌ای روی پیام‌رسان ایرانی ۲) تشخیص هوشمند نگرانی در پاسخ بیمار ۳) پایش عکس‌محور بهبودی.**
> اگر بسازیمشان، کامل‌ترین گزینه بازار فارسی‌زبان می‌شویم → فاز ۵ نقشه راه.

### Tier A — بهترین‌ها دارند، ما صفر داشتیم (ROI بالا)

| # | قابلیت | نمونه جهانی | فاز ما |
|---|---|---|---|
| A1 | Patient Portal + رزرو آنلاین + فرم پیش‌ازمراجعه | هسته Fresha/Pabau/Zenoti | 5 |
| A2 | یادآور + توالی Aftercare چندمرحله‌ای پیام‌رسانی | gap بازار فارسی! | 5 |
| A3 | رضایت‌نامه دیجیتال با امضا متصل به درمان | Zenoti/Pabau core | 3 |
| A4 | کنترل کیفیت تصویر لحظه capture | DermEngine Smart QC | 2 |
| A5 | Evolution Tracker سطح ضایعه (MoleMatch/Flicker) | DermEngine/FotoFinder/LumoScanner | 6 |
| A6 | جستجوی تصویری مشابه از اطلس تأییدشده | DermEngine Advanced Search | 6 |

### Tier B — موج AI سال ۲۰۲۵-۲۶ که هنوز به دامنه ما نرسیده

| # | قابلیت | نمونه جهانی | نسخه ایرانی ما | فاز |
|---|---|---|---|---|
| B7 | AI Scribe — گفتار جلسه ← نوت ساختاریافته | Mentera/Nuance DAX | Whisper لوکال آفلاین | 7 |
| B8 | AI پذیرش ۲۴/۷ روی پیام‌رسان | Zenoti AI Concierge | ربات Telegram/Bale | 7 |
| B9 | Copilot چت روی داده کلینیک | Mentera AI Search | RAG روی pgvector خودمان | 7 |
| B10 | Heatmap توضیح‌پذیری مدل | LumoScanner heatmap | Grad-CAM — به فاز ۶ تقديم شد | 6 |
| B11 | تشخیص نگرانی در پاسخ بیمار + پیش‌نویس پاسخ | gap اعلام‌شده بازار | inbound_messages.concern | 7 |

### Tier C — لایه تجاری (درآمد کلینیک = قلاب ماندگاری)

A3/A2 قبلی · C12 عضویت/پکیج/باشگاه مشتری (Pabau strongest) · C13 کمپین بازگشت بر اساس تاریخچه («۶ ماه از آخرین PRP») · C14 انبار محصولات (شامپو/سرم) · C15 فاکتور/POS با درگاه ایرانی (زرین‌پال adapter) · C16 چندشعبه (schema از روز اول، UI فاز ۷) · C17 مشاوره تصویری داخلی. → فازهای ۵ و ۷.

### Tier D — مدرن‌های پلتفرمی

D18 Open API + Webhook + **سرور MCP رسمی (ADR-20)** (فاز ۷) · D19 PWA قابل نصب برای پورتال (فاز ۵) · D20 White-label برای زنجیره‌ها (فاز ۷) · D21 اپ همراه capture موبایل با راهنمای زاویه، ثبت مستقیم در پرونده (سال ۲).

### چیزی که ما داریم و بهترین‌ها ندارند (مزیت ترکیبی انحصاری)

Offline-first واقعی · لایه آموزش سه‌بعدی بیمار · Self-Hosted کامل · Data Flywheel اختصاصی · RTL/فارسی native · لایسنس بدون dongle · Explainability-first · **سرور MCP رسمی (AI-native)**.
**نتیجه:** رقبا «کامل‌ترند اما قدیمی»؛ ما با بستن Tier A در فاز ۵، کامل‌ترین گزینه بازار فارسی‌زبان می‌شویم.

---

## 19. لایه ابزار AI — سرور MCP (Model Context Protocol)

> **ADR-20 · وضعیت پروتکل:** MCP استاندارد باز اتصال AI به نرم‌افزار است — از دسامبر ۲۰۲۵ تحت Linux Foundation، با پشتیبانی رسمی OpenAI/Microsoft/Google و صدها میلیون دانلود SDK در ماه. نسخه جاری `2026-07-28` هسته **stateless** دارد (request/response روی HTTP معمولی — بدون session) ← دقیقاً روی NestJS/Fastify فعلی اجرا می‌شود. ترنسپورت: فقط **Streamable HTTP** (SSE منسوخ شده). کلاینت‌های سازگار امروز: Claude Desktop · VS Code/Copilot · ChatGPT connectors · Microsoft Copilot Studio/Foundry · هر agent سفارشی.

### 19.1 چرا MCP — تمایز و صرفه

| بدون MCP (فقط REST/OpenAPI) | با سرور MCP |
|---|---|
| اتصال هر ابزار AI = integration اختصاصی توسعه‌دهنده | کلاینت‌های آماده Claude/Copilot/agent بلافاصله وصل می‌شوند |
| ساخت Copilot کامل داخلی + هزینه LLM سمت ما | «هر AI خودت را بیاور» — بخش بزرگی از هزینه LLM به سمت کاربر منتقل می‌شود |
| هر ربات پیام‌رسان = منطق جداگانه | Bot های Bale/Eitaa/Telegram پوسته نازک روی همان tools |
| Copilot داخلی مسیر کد مستقل | Copilot داخلی (B9) = یک MCP Client روی همان Registry — نصف کد، همیشه هم‌نسخه |

**موقعیت بازار:** هیچ رقیب فارسی‌زبان (و تقریباً هیچ رقیب جهانی در دامنه کلینیک) سرور MCP رسمی ندارد ← positioning «اولین پلتفرم کلینیک AI-native بازار فارسی».
**تصمیم مالک:** فیچر MCP **پیش‌فرض فعال** است (نه opt-in)؛ owner کلینیک می‌تواند در تنظیمات غیرفعالش کند — این تغییر وضعیت در audit_log ثبت می‌شود.

### 19.2 معماری — یک Tool Registry، چند مصرف‌کننده

```
Claude Desktop / VS Code / Agent سفارشی / Bot پیام‌رسان (B8) / Copilot داخلی (B9)
        │  Streamable HTTP + Bearer JWT (همان Auth موجود)
        ▼
apps/api → /mcp ──► Tool Registry (packages/shared): zod schema → inputSchema خودکار
        │
        ▼ همان مسیر Service → Repository → RLS → Audit
PostgreSQL(RLS) · MinIO · pgvector
```

**اصل طلایی:** MCP server هرگز DB را مستقیم نمی‌بیند؛ فقط مترجم intent→tool-call است و مرز امنیت در همان چهار لایه §7 می‌ماند («boundary at the data layer, not at the prompt» — الگوی تثبیت‌شده MCP در سلامت که پرامپت‌اینکشن را عملاً بی‌اثر می‌کند).

### 19.3 Tools نسخه ۱ (فقط-خواندنی) و نسخه ۲ (نوشتنی)

| Tool | کاربرد | خروجی whitelist |
|---|---|---|
| `search_patients(query)` | یافتن بیمار (pg_trgm) | id، نام، آخرین جلسه |
| `get_patient_summary(patient_id)` | پرونده خلاصه | تعداد جلسات، تشخیص‌ها، روند اسکور |
| `get_analysis(analysis_id)` | نتیجه تحلیل | metrics + لینک توکن‌دار Grad-CAM overlay |
| `list_low_confidence_analyses()` | صف Active Learning برای متخصص | موارد زیر آستانه confidence |
| `list_today_sessions(branch_id?)` | برنامه روز | slot ها + status |
| `get_revenue_summary(period)` | گزارش مالی owner | فقط aggregate |

نسخه ۲ (هر کدام با clientMutationId + تأیید انسانی): `schedule_appointment` · `submit_expert_review` (ساخت Gold-label از هرجا که متخصص است) · `enroll_aftercare`.

### 19.4 کارایی عملی — سه سناریو

1. **تریکولوژیست خارج از اپ:** در Claude Desktop می‌پرسد «بیماران این ماه با قرمزی شدید؟» → `search_patients` + `get_patient_summary` — بدون باز کردن برنامه.
2. **بازبینی مدل از راه دور:** صف low-confidence در محیط AI متخصص باز می‌شود و `submit_expert_review` با تأیید انسانی Gold-label می‌سازد ← شتاب Flywheel §10.
3. **ربات پذیرش:** پیام Bale ← پوسته نازک ← `schedule_appointment` ← رزرو واقعی؛ منطق booking فقط یک‌بار در Registry نوشته شده.

### 19.5 قواعد امنیتی بحرانی (خلاصه — متن کامل engineering-rules §10)

1. **دو هویت اجباری در هر call:** هویت agent (توکن ثبت‌شده) + کاربرِ به‌نیابت (on-behalf-of) — هر دو در audit_log؛ request ناقص = رد
2. **field-whitelist per-tool:** هیچ toolی رکورد کامل برنمی‌گرداند (الگوی minimum-necessary)
3. **read-only اول؛ write ها idempotent + تأیید انسانی**
4. **rate-limit دوگانه:** per-agent و per-user
5. **@RequireFeature('mcp')** + ثبت هر tool call توسط AuditLogInterceptor موجود
6. **پرامپت‌اینکشن:** چون مرز در RLS/Repository است، ورودی مخرب از scope عبور نمی‌کند — تست منفی cross-tenant الزامی

### 19.6 حریم داده و استقرار

| حالت | مسیر داده | وضعیت |
|---|---|---|
| Cloud + کلاینت خارجی (Claude/OpenAI) | PHI از سرور ما به LLM سرویس خارجی می‌رود | **فعال (تصمیم مالک محصول)** · owner کلینیک می‌تواند خاموش کند · کاملاً audit‌شده |
| Cloud + Copilot داخلی | LLM سمت خودمان با provider منتخب (§4/ADR-18) | پیش‌فرض تجربه داخلی |
| Self-Hosted | تمام مسیر MCP داخل شبکه کلینیک | کاملاً در اختیار کلینیک |

- توصیه مستند برای کلینیک‌های فوق‌حساس: agent لوکال/self-hosted یا Copilot داخلی
- فعال‌سازی/غیرفعال‌سازی per-clinic تصمیم تنظیمی است و در audit_log ثبت می‌شود

### 19.7 زمان‌بندی

- **فاز ۶ (spike کوچک):** طراحی Tool Registry (zod→schema) کنار expert-review UI
- **فاز ۷:** سرور MCP production (tools v1) + Copilot/B8 به‌عنوان client + write-tools v2
- **سال ۲:** MCP Apps (رندر تعاملی قبل/بعد داخل گفتگوی AI) + گسترش tools

---

## پیوست A — Unit Economics (قالب — قبل از قیمت‌گذاری نهایی پر شود)

| قلم هزینه (per clinic / month) | Cloud (VPS ما) | Self-Hosted |
|---|---|---|
| سهم VPS · DB · Storage · bandwidth | ___ | ۰ (سرور مشتری) |
| SMS/پیام‌رسان (میانگین پیام/ماه) | ___ | کلید API خود مشتری |
| GPU آموزش ML (سرشده بین کلینیک‌ها) | ___ | n/a |
| پشتیبانی و onboarding | ___ | ___ |
| **جمع COGS** | ___ | ___ |

**قاعده:** قیمت هر پلن ≥ ۴× COGS آن؛ در غیر این صورت سهمیه‌های `plans` (§9.1) تعدیل شوند.
*با داده واقعی pilot به‌روزرسانی شود.*

---

*این سند زنده است — هر تغییر معماری باید ADR جدید ضبط کند.*







# فاز 1 — ستون فقرات (Auth/RBAC/Tenancy/Audit/Entitlement + CRUD)

> زمان: هفته ۱-۴ · پیش‌نیاز: DoD فاز 0 پاس باشد

## هدف
API هسته امن + وب‌شل اپ، طوری که فروش پلن‌ها از همین فاز ممکن باشد.

## مرجع سند
DESIGN-V2 §6.1 · §7 (چهارلایه ایزوله) · §9.1 (Plans) · §13

## تسک‌ها

### 1.1 packages/db
- Drizzle setup + migration اول با جداول §6.1 (clinics, branches, users, patients, services, sessions, gallery_items, analyses, consents, audit_log) + §6.3 plans/plan_features/entitlements/usage_counters
- RLS policy ها + seed: یک clinic آزمایشی + سه نقش + دو plan
- Index ها: partial unique (مانند patients.phone با `WHERE deleted_at IS NULL`) + pg_trgm روی name/phone برای جستجوی فارسی

### 1.2 apps/api — Auth & RBAC
- NestJS+Fastify bootstrap، ZodValidationPipe سراسری، شکل خطای ثابت `{code,message,details?}`
- JWT access(15m)+Refresh چرخشی با detect استفاده مجدد · Argon2id
- RolesGuard + دکوریتور @Roles() · session revoke

### 1.3 apps/api — Tenancy & Audit
- TenancyMiddleware: استخراج clinicId از JWT → `SET LOCAL app.clinic_id`
- RepositoryBase اجباری-scoped · تست منفی cross-tenant برای هر endpoint (الزام engineering-rules §1)
- AuditLogInterceptor: append-only + hash-chain (prev_hash)

### 1.4 apps/api — Plans & Entitlements (§9.1)
- EntitlementService.resolve(clinicId) با کش کوتاه
- @RequireFeature(feature) Guard + QuotaGuard (چک usage_counters)
- endpoint های admin-plan CRUD (فقط role=owner + feature 'admin')

### 1.5 CRUD بیمار/جلسه
- patients/sessions/services REST کامل + pagination + soft-delete
- OpenAPI خودکار + قرارداد zod منتشرشده در packages/shared

### 1.6 apps/web — شل اپ
- Vite+React+Router+i18next(RTL) + TanStack Query setup
- Login + Layout (Microscopy Premium پایه: توکن‌های رنگ/تایپ §12)
- صفحه Patients/Sessions با فرم‌های react-hook-form+zod

### 1.7 CI کامل
- testcontainers integration + compose smoke + coverage gate ≥70% روی db/api logic
- **Postgres واقعی در CI** (docker-compose) + migration-from-empty روی هر push (§14.2)
- آپلود گزارش‌ها فقط به‌صورت artifact با `if: always()` — کامیت به main ممنوع

### 1.8 نگهبان معماری (ADR-21/22 · §14.3-14.4)
- tools/conformance: قوانین v1 (tenant-safety · db-access · phi-logs · feature-gate · error-contract · secrets) — هر قانون با fixture نقض + self-test
- exceptions.json — استثنا = ارجاع ADR اجباری؛ ورودی بدون ADR = fail
- tools/graph: extract مکانیکی (workspace deps · جداول clinic_id/RLS از migrations Drizzle · endpoints/@RequireFeature/@Roles · ADR register · موجودی تست) → PROJECT_GRAPH.md + project-graph.json
- اتصال به CI: conformance run + graph --check به‌عنوان required checks

## Definition of Done
```powershell
pnpm test            # unit+integration پاس
pnpm typecheck; pnpm lint; pnpm build   # پاس
docker compose -f ops/dev.yml up -d; pnpm e2e --grep "@smoke"   # login+CRUD پاس
pnpm conformance; pnpm graph --check   # نگهبان معماری پاس
```
- [ ] تست cross-tenant: دریافت داده clinic دیگر = 404 (اثبات RLS)
- [ ] endpoint بدون @RequireFeature که فیچر gated را سرو کند وجود ندارد (تست متا)
- [ ] audit_log برای هر write ثبت شده و hash-chain verify می‌شود
- [ ] ایجاد plan جدید فقط با INSERT (بدون تغییر کد) قابل تست است
- [ ] جستجوی بخشی از نام بیمار (فارسی) با pg_trgm از طریق repository پاس می‌شود
- [ ] هارنس conformance همه قوانین v1 را با fixture خودش self-test کرده و روی ریپو PASS است
- [ ] graph --check در CI سبز است و project-graph.json کامیت شده

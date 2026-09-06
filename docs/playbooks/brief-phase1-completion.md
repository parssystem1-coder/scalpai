# Phase 1 Completion Brief — باقی‌مانده فاز ۱ (فرمت Nexora)

> پیش‌نیاز: چک‌پوینت گیت 2026-08-25 (`GATE_REVIEW_phase-1-checkpoint`) — blocking items همین سند را تعریف می‌کنند.
> کادنس: هر slice = چرخه §12 قوانین؛ بعد از هر slice **STOP & REPORT** تا ack مالک.

## §0 — Scope قفل‌شده
فقط پنج slice زیر. ساخت هر چیز دیگر (حتی بهبود وسوسه‌کننده کد موجود) = انحراف و نیازمند توقف+گزارش.

## Slice T1 — web/login
- apps/web: Vite+React شل + صفحه login (react-hook-form+zod از shared) + ذخیره token در حافظه + ریدایرکت خالی post-login
- i18next fa/en پایه با RTL؛ دیزاین کامل ممنوع (فاز ۴)
- mini-DoD: build/typecheck سبز · یک تست render · push + completion file

**⛔ STOP & REPORT**

## Slice T2 — web/patients
- صفحه لیست بیماران (TanStack Query → GET /api/v1/patients) + فرم ایجاد بیمار
- نمایش خطای canonical {code,message}
- mini-DoD: build/typecheck/test سبز · push + completion file

**⛔ STOP & REPORT**

## Slice T3 — Playwright @smoke
- نصب Playwright (+browsers) · e2e/smoke.spec.ts: login→ایجاد بیمار→دیده‌شدن در لیست روی API واقعی لوکال
- اسکریپت `pnpm e2e` + اجرا در DoD
- mini-DoD: @smoke سبز لوکال · push + completion file

**⛔ STOP & REPORT**

## Slice T4 — Coverage gate ≥70%
- vitest coverage (v8) فقط برای packages/{db,sync-client,licensing,analysis-core} منطق
- آستانه lines≥70 در CI step جدید
- mini-DoD: عبور لوکال · push + completion file

**⛔ STOP & REPORT**

## Slice T5 — ADR انحراف Audit-as-Service
- ADR-0025: AuditService داخل تراکنش + REVOKE SQL به‌جای Interceptor (دلیل قوی‌تر بودن)
- ثبت ردیف در §17 سند
- mini-DoD: فایل ADR + ردیف اندیس · push + completion file

**⛔ STOP & REPORT**

## Exit criteria پایان فاز ۱ — همگی با CI/اجرای محلی اثبات:
1. `pnpm test` سبز شامل @smoke مرورگر
2. coverage ≥70% قفل‌شده در CI
3. conformance PASS · graph --check سبز
4. GATE_REVIEW نهایی فاز ۱ = PASS

---

## §الحاق — amendments مصوب مالک (2026-08-25، پس از تحلیل عمیق)

> ثبت رسمی انحراف از scope قفل‌شده §0 با ack صریح مالک؛ ردیابی ضعف‌ها: `docs/WEAKNESSES.md`

### Slice H — db-hardening (قبل از گیت)
- `pg_advisory_xact_lock` در appendAudit + تست همزمانی زنجیره (W06)
- migration جدید: trigger `updated_at` برای patients/sessions + تست bump (W07)
- پاک‌سازی mojibake فایل‌های کامیت‌شده seed.ts · core.repo.ts · users.repo.ts · core.integration.spec.ts (W02/W03)
- قانون conformance جدید «encoding-guard» با fixture نقض + self-test (W15) + حکم معناشناسی زنجیره audit در کامنت/تست (W21)

### Slice T6 — تکمیل تعهدات پلی‌بوک 1.4/1.5
- QuotaGuard روی usage_counters (W08) · admin-plan CRUD فقط owner (W09) · OpenAPI حداقلی (W10) · ساخت exceptions.json (W11)

### ترتیب اجرای به‌روزشده
T3 → H → T6 → T4 → T5 → گیت نهایی

### حکم e2e در CI (حکم W13)
@smoke در mini-DoD فقط لوکال اجرا می‌شود (ADR-0024)؛ ورود browser-e2e به CI تصمیم فاز ۲ است و در completion فایل T3 ثبت می‌شود — Exit criteria #1 با اجرای لوکال + گزارش artifact اثبات می‌شود.

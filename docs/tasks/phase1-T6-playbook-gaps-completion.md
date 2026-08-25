# Phase 1 · Slice T6 — playbook gaps (QuotaGuard · admin-plans · OpenAPI · exceptions.json) · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase1-t6-playbook-gaps` → PR (Gated lane)
- **مجوز:** §الحاق brief-phase1-completion.md (ack مالک) — بستن W08..W12 از docs/WEAKNESSES.md

## انجام‌شده

| آیتم | شرح | ردیابی |
|---|---|---|
| QuotaGuard | گارد `@Quota(metric)` — سهمیه از `limits` پلن خوانده می‌شود؛ metric بدون سهمیه = unmetered؛ مقایسه با `usage_counters` دوره ماه جاری → 403 `QUOTA_EXCEEDED`. بعد از FeatureGuard در زنجیره APP_GUARD | W08 |
| Metering | `incrementUsage` داخل همان تراکنش createSession (metric: monthly_sessions) — انحراف مستند: DESIGN می‌گوید worker ها متر می‌کنند؛ تا فاز ۵ (BullMQ) inline-in-tx قوی‌تر و اتمیک است | W08 |
| admin-plan CRUD | کنترلر `/plans` کامل: list / get / POST / PUT / DELETE — gate دوگانه `@Roles("owner") + @RequireFeature("admin")`؛ حذف plan در-use → 409 CONFLICT؛ هر write با appendAudit داخل tx. قرارداد `PlanUpsert` zod در shared | W09 |
| seed | growth: feature `admin` + limit `monthly_sessions:3`؛ starter: `monthly_sessions:5` + یک service دمو برای کلینیک B | پشتیبانی تست |
| OpenAPI | `@nestjs/swagger` (+`@fastify/static`) — UI روی `/api/v1/docs` و JSON روی `/api/v1/docs-json`؛ زنده تأیید شد: 200، title=ScalpAI API، ۱۱ path. غنی‌سازی schema ها فاز ۴ | W10 |
| exceptions.json | `tools/conformance/exceptions.json` + موتور load/apply در هارنس: ورودی بدون `adr` معتبر (`ADR-\d{3,4}`) = **ABORT build (exit 2)**؛ ورودی معتبر violation های match را suppress می‌کند و شمارش گزارش می‌شود؛ ۳ self-test جدید | W11 |

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | **26 passed / 26** (+۷ جدید: ۲ plans-CRUD، ۲ quota، ۳ exceptions-harness) |
| typecheck / lint / build | 16/16 · exit0 · 14/14 |
| conformance | PASS (7 rules) |
| graph --check | سبز |
| `pnpm e2e` @smoke | 1 passed (پس از تغییرات main.ts) |
| OpenAPI زنده | GET /api/v1/docs-json → 200 |

## سیاست‌هایی که این slice اثبات کرد
- **دو لایه gate مستقل:** کلینیک starter (بدون `admin`) → FEATURE_DISABLED حتی با role owner؛ یعنی پلن واقعاً قدرت دارد نه فقط نقش.
- **سهمیه داده‌محور:** تغییر budget = UPDATE روی limits پلن، صفر خط کد — وعده §9.1 عملی شد.
- **حفاظت کاتالوگ:** plan در حال استفاده حذف نمی‌شود (409).

## یادداشت صادقانه فرآیندی
- سه دور fail→fix واقعی: ترتیب نامعین features در SELECT (repo حالا sort می‌کند)، نبود دایرکتوری fixture در self-test، وابستگی جاافتاده fastify-static که فقط در اجرای زنده لو رفت (build/typecheck آن را نمی‌گیرند — محدودیت شناخته‌شده).
- metering فعلاً فقط روی sessions سیم‌کشی شده؛ endpoint های مصرفی بعدی (upload/analysis) با فاز خودشان اضافه می‌شوند.

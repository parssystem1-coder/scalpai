# GATE REVIEW — Phase 1 · Checkpoint (ممیزی میانه‌فاز به درخواست مالک)

- **تاریخ:** 2026-08-25 · **ممیز:** scalpai-gate (جلسه مستقل)
- **Commit ممیزیشده:** `ea4c27b` (main)
- **نوع:** Checkpoint میانه‌فاز — حکم نهایی فاز هنوز صادرنشده؛ این گزارش وضعیت فعلی را شواهدمحور مستند می‌کند.
- **حکم این چک‌پوینت:** ✅ کارهای انجام‌شده سالم‌اند · ⛔ **فاز ۱ هنوز FAIL است برای اعلام «تمام»** — ۳ آیتم DoD باقی است.

## ۱. اجرای تحت‌اللفظی دستورات verify

| دستور | خروجی کلیدی | وضعیت |
|---|---|---|
| `pnpm test` | **12 passed / 12** (۳ فایل) | ✅ |
| `pnpm typecheck` | Tasks: 14 successful / 14 | ✅ |
| `pnpm lint` | exit 0 | ✅ |
| `pnpm build` | Tasks: 14 successful / 14 | ✅ |
| `docker compose ... e2e @smoke` | **موجود نیست** — Playwright نصب/راه‌اندازی نشده | ⛔ باقی |
| coverage gate ≥70% | در vitest.config پیکربندی نشده (`coverage` یافت نشد) | ⛔ باقی |

## ۲. نگهبان معماری

| گیت | نتیجه |
|---|---|
| `pnpm conformance` | **PASS (6 rule(s), 0 violations)** |
| `pnpm graph -- --check` | exit 0 |

## ۳. نمونه‌گیری امنیتی (اجراهای واقعی، نه ادعا)

| نمونه | روش | نتیجه |
|---|---|---|
| cross-tenant منفی | اجرای مجدد فقط همان تست (`vitest -t "clinic B owner cannot read"`) | ✅ 1 passed — B روی بیمار A: 404 |
| feature-gate سورسی | grep کنترلر | `@RequireFeature("portal")`:59 · `@RequireFeature("ml_updates")`:81 |
| Plan = INSERT-only (§9.1) | INSERT واقعی plan جدید با نقش اپ → RETURNING + count=3 | ✅ بدون deploy |
| audit append-only | قبلاً اثبات‌شده: UPDATE روی audit_log با نقش اپ → permission denied | ✅ (شواهد در تاریخچه گزارش‌ها) |

## ۴. بهداشت گیت

- ۲۵ کامیت؛ ۴ subject غیرconventional = هر چهار تا **merge commit** (سه‌تا تولید خودکار گیت‌هاب از PR ها + یکی مربوط به پیش از فعال‌شدن هوک‌ها) — مشاهده، نه تخلف
- صفر فایل ممنوعه در `git ls-files` (node_modules/.env/.turbo/dist/log)
- آخرین run CI روی main پس از PR #3: **success** (1m0s)
- protection (`required=["base"]`, strict) + auto-merge فعال — **PR #3 با auto-merge واقعی merge شد**

## ۵. همگامی اسناد و انحرافات

| مورد | وضعیت |
|---|---|
| PROGRESS.md فاز ۱ | دقیقاً منطبق بر واقعیت (✓/باقی‌ها صادقانه جدا شده) |
| ADR-0024 (native PG17 لوکال، docker فقط CI) | رعایت — تست‌ها روی PG17 native اجرا شدند |
| TS ~5.9.3 pin | عامدانه؛ ADR هنگام ارتقا |
| `minimumReleaseAge: 60` + registry mirror `.npmrc` | مستند در فایل؛ ریشه: ناپایداری شبکه ایران |
| انحراف playbook: AuditLogInterceptor → AuditService داخل تراکنش + REVOKE SQL | قوی‌تر از طرح اولیه؛ **نیازمند ADR کوچک در فاز جاری** |
| انحراف playbook: e2e محلی بجای docker compose (ADR-0024) | پوشش داده شده |

## ⛔ Blocking items تا گیت نهایی فاز ۱ (مسئول: scalpai-build)

1. `apps/web` شل: login + لیست بیماران (Vite+React+i18next RTL پایه)
2. Playwright + سناریوی `@smoke` (login→CRUD) — نیازمند نصب browsers (~۱۲۰MB دیسک)
3. پیکربندی coverage و قفل آستانه ≥70% برای packages منطقی
4. (خُرد) ADR ثبت انحراف Audit-as-Service

## معیار قبولی مجدد
اجرای کامل همین پروتکل از صفر پس از رفع موارد بالا؛ ادغام با این گزارش ممنوع.

*امضا: scalpai-gate · 2026-08-25T10:35+03:30*

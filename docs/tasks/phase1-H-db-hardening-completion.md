# Phase 1 · Slice H — db-hardening · Completion

- **Date:** 2026-08-25
- **Commit:** `3449845` — branch `feat/phase1-db-hardening` → PR (Gated lane)
- **مجوز:** §الحاق brief-phase1-completion.md (ack صریح مالک) · ردیابی: docs/WEAKNESSES.md

## انجام‌شده

| آیتم | شرح | ردیابی |
|---|---|---|
| advisory lock | `pg_advisory_xact_lock(hashtext(clinicId))` در ابتدای appendAudit — دو تراکنش همزمان هرگز prev_hash تکراری نمی‌خوانند؛ کلید per-clinic پس کلینیک‌های موازی بلاک نمی‌شوند؛ آزادسازی خودکار با COMMIT/ROLLBACK | W06 |
| تست همزمانی | «chain stays intact under concurrent same-clinic creates» — ۶ ایجاد همزمان بیمار + verifyChain بعدش | اثبات W06 |
| trigger updated_at | migration `0004__audit_lock_and_updated_at.sql`: fn_touch_updated_at + trigger روی patients/sessions + repo helper `getPatientIncludingDeleted` + تست bump روی soft-delete | W07 |
| de-mojibake | پاک‌سازی کامل: seed.ts (نام‌های دمو فارسی)، core.repo.ts، users.repo.ts، migrate.ts، contracts.ts، error.filter.ts، jwt-access.guard.ts، core.controller.ts، core.integration.spec.ts، vitest.config.ts | W02/W03 + کشفیات جدید |
| قانون encoding-guard | قانون conformance هفتم: امضای CP1252-artifact (زوج‌های Â/Ã/Ø/Ù/â + غیرASCII) و U+FFFD را در apps/packages/docs/tools/e2e + کانفیگ‌های ریشه می‌گیرد؛ fixture نقض + self-test (clean Persian pass / mojibake+FFFD fail) | W15 |
| معناشناسی زنجیره | کامنت رسمی: زنجیره per-clinic است (prev-hash داخل tenant tx خوانده می‌شود)؛ verifyChain فقط ردیف‌های قابل‌مشاهده caller را verify می‌کند | W21 |

## یافته مهم حین اجرا
قانون encoding-guard در اولین اجرا روی خود ریپو **۵ فایل خراب دیگر** لو داد (jwt-access.guard، error.filter، core.controller، migrate، contracts — شامل متن خطاهای کاربر-روی مثل «توکن ارسال نشده» که تا امروز garbage ارسال می‌شد). همه اصلاح شدند — ارزش ماشینی‌سازی قوانین عملاً ثابت شد.

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm db:migrate` | applied=1 (0004) |
| `pnpm test` | **19 passed / 19** (+۳ تست جدید: concurrency، trigger، encoding self-test) |
| typecheck / lint / build | 16/16 · exit0 · 14/14 |
| conformance | **PASS (7 rules)** — شامل encoding-guard روی کل ریپو |
| graph --check | سبز |

## یادداشت صادقانه فرآیندی
- تست همزمانی اولین بار fail شد — عیب از تولید phone در خودِ تست بود (تلفن تکراری → 500)، نه از lock؛ تست اصلاح شد نه سخت‌گیری‌اش کم شد.
- spec ها حالا `@scalpai/db` را از dist مصرف می‌کنند (پیامد تغییر main→dist در T3)؛ پس از هر تغییر packages/db باید build شود — برای CI مشکلی نیست (build قبل از test اجرا می‌شود).

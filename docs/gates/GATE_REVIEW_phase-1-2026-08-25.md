# GATE REVIEW — Phase 1 · ستون فقرات (گیت نهایی فاز)

- **تاریخ:** 2026-08-25 · **ممیز:** scalpai-gate (جلسه مستقل از سازنده — الگوی چهارچشم)
- **Commit ممیزیشده:** `c4b8f7e` (main)
- **نوع:** گیت نهایی پایان فاز ۱ پس از اتمام همه slice های brief + الحاقات مصوب مالک (T1..T6، H)
- **مراجع DoD:** playbooks/phase-1-backbone.md §DoD · brief-phase1-completion.md (+§الحاق) · engineering-rules.md

## ۱. اجرای تحت‌اللفظی دستورات verify

| دستور | خروجی کلیدی | وضعیت |
|---|---|---|
| `pnpm typecheck` | Tasks: 16 successful / 16 | ✅ |
| `pnpm lint` | exit 0 | ✅ |
| `pnpm build` | Tasks: 14 successful / 14 | ✅ |
| `pnpm db:migrate` | applied=0 skipped=4 — اثبات from-empty در CI (run سبز روی main با استپ migration-from-empty) | ✅ |
| `pnpm test` | **26 passed / 26** (۵ فایل) — شامل cross-tenant منفی، audit-chain، همزمانی زنجیره، trigger ‏updated_at، quota، plans-CRUD | ✅ |
| `pnpm test:coverage` | lines=**81.06%** ≥ 70% بدون ERROR (آستانه قفل در CI step) | ✅ |
| `pnpm e2e` (@smoke مرورگری روی استک واقعی لوکال) | **1 passed** (login→ایجاد بیمار→لیست) | ✅ |

یادداشت انحراف اجرا: بند DoD پلی‌بوک «docker compose up» طبق ADR-0024 به مسیر native PG17 لوکال جایگزین شده — انحراف ثبت‌شده و پذیرفته (سابقه گیت چک‌پوینت). `--grep "@smoke"` ناموثر است چون testDir فقط همین spec را دارد؛ معادل اجرا شد.

## ۲. آیتم‌های چک‌لیست DoD

| # | آیتم | شواهد ممیز | وضعیت |
|---|---|---|---|
| 1 | تست cross-tenant: داده کلینیک دیگر = 404 | تست suite (`clinic B owner cannot read a clinic A patient - 404`) + نمونه‌گیری زنده ممیز: ایجاد بیمار با توکن A، خواندن با توکن B → **HTTP 404** | ✅ |
| 2 | هیچ endpoint gated بدون @RequireFeature (تست متا) | قانون machine‌ای `feature-gate` PASS + نمونه‌گیری زنده: `/ml/status` starter→403 / growth→200 · `POST /plans` starter→403 FEATURE_DISABLED | ✅ |
| 3 | audit_log برای هر write و verifyChain سبز | تست‌های suite + حذف plan نمونه‌گیری زنده → chain همچنان verify (تست lifecycle) | ✅ |
| 4 | ایجاد plan فقط با INSERT/بدون deploy | نمونه‌گیری زنده ممیز: POST `/plans` کد `gate_probe` → 201 با features، سپس DELETE → 200؛ صفر تغییر کد | ✅ |
| 5 | جستجوی جزئیِ نام فارسی با pg_trgm از Repository | نمونه‌گیری زنده ممیز: بیمار «سمیرا احمدی» → `GET /patients?q=احم` → یافته‌شدن همان رکورد | ✅ |
| 6 | self-test هارنس + PASS روی ریپو | `Conformance harness: PASS (7 rule(s), 0 violations)` — ۷ قانون با fixture/self-test | ✅ |
| 7 | graph --check سبز و project-graph.json کامیت‌شده | exit 0 · فایل tracked در git | ✅ |

## ۳. Exit criteria brief (الحاق‌شده)

| # | معیار | نتیجه |
|---|---|---|
| 1 | pnpm test سبز شامل @smoke مرورگر (لوکال — حکم W13 در T3 completion) | ✅ |
| 2 | coverage ≥70% قفل در CI | ✅ 81.06% |
| 3 | conformance PASS · graph --check سبز | ✅ |
| 4 | GATE_REVIEW نهایی = PASS | ✅ همین سند |

## ۴. نگهبان معماری

| گیت | نتیجه |
|---|---|
| `pnpm conformance` | PASS — 7 rule(s), 0 violations |
| `pnpm graph -- --check` | exit 0 |

## ۵. نمونه‌گیری امنیتی زنده (اجرای واقعی توسط ممیز)

| نمونه | روش | نتیجه |
|---|---|---|
| ایزوله tenant | جفت توکن A/B واقعی | B روی بیمار A: **404** نه داده |
| feature-gate دو طرفه | ml/status + plans با هر دو پلن | growth=200/201 · starter=403 FEATURE_DISABLED |
| سهمیه پلن | ۴× POST session با growth | هر ۴ → 403 (شمارنده ۳/۳ مانده از suite قبلی) — **اثبات جانبی پایداری metering در restart**؛ کد QUOTA_EXCEEDED در لاگ suite ثبت است |
| OpenAPI | GET /api/v1/docs-json | 200، title=ScalpAI API، ۱۱ مسیر |
| pg_trgm فارسی | q=«احم» | تطابق دقیق رکورد مقصد |

## ۶. بهداشت گیت

- `git ls-files`: **صفر** فایل ممنوعه (node_modules/.env/.turbo/dist/coverage/test-results/log)
- ۱۳ کامیت بازه فاز: همه conventional؛ ۵ مورد غیر-conventional = صرفاً merge commit های استاندارد GitHub (مشاهده، نه تخلف — سابقه گیت‌های قبلی)
- هر PR مسیر Gated (#6..#9) با CI سبز merge شده؛ auto-merge فعال و عملیاتی
- گزارش‌ها artifact — هیچ خروجی تولیدی CI به main کامیت نشده
- آخرین run های main: success ×3

## ۷. همگامی اسناد و انحرافات

| مورد | وضعیت |
|---|---|
| PROGRESS.md فاز ۱ | منطبق بر واقعیت — هر تیک completion file دارد (T1,T2,T3,H,T6,T4,T5) |
| ADR-0024 (native PG17 لوکال) | رعایت — همه اجراها روی PG17 native |
| ADR-0025 (Audit داخل tx) | ثبت + ردیف §17 — انحراف پلی‌بوک 1.3 مختومه |
| حکم e2e-in-CI (W13) | مستند در T3 completion: browser-e2e تا فاز ۲ لوکال می‌ماند |
| Weakness Registry | W01..W11,W13,W15,W21 ✅ · W16..W20 موکول با فاز مقصد · W22 پایشی |
| metering inline-tx (خلاف متن DESIGN §9.1 که worker می‌گوید) | انحراف کوچک مستند در T6 completion؛ worker در فاز ۵ — نیازی به ADR جدا ندارد (تصمیم تاکتیکی، مرز معماری عوض نمی‌شود) |

## ⛔ Blocking items

**هیچ.**

## حکم نهایی

**PASS** — فاز ۱ طبق DoD پلی‌بوک + الحاقات مصوب تمام است. مجاز به شروع فاز ۲ (رسانه و تحلیل).

*امضا: scalpai-gate · 2026-08-25*

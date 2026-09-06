# GATE REVIEW — Phase 2 · رسانه و تحلیل (گیت نهایی — اجرای مجدد از صفر)

- **تاریخ:** 2026-08-26 · **ممیز:** scalpai-gate (جلسه مستقل از سازنده)
- **Commit ممیزیشده:** `cacc9d2` (main)
- **پیشینه:** گیت قبلی (`GATE_REVIEW_phase-2-2026-08-26.md`) به‌دلیل بند «آپلود 50MB با پیشرفت صحیح» FAIL بود؛ blocker با PR ‏#16 رفع و **این پروتکل از صفر** روی کامیت جدید اجرا شد. ادغام با گزارش قبلی نشده است.

## ۱. اجرای تحت‌اللفظی دستورات verify

| دستور | خروجی کلیدی | وضعیت |
|---|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | سبز · exit0 · 14/14 | ✅ |
| `pnpm db:migrate` | applied=0 skipped=7 (from-empty در CI سبز) | ✅ |
| `pnpm test:coverage` | **62 passed / 62** · lines=**86.06%** ≥70 بدون ERROR | ✅ |
| `pnpm conformance` | PASS ‏(7 rules, 0 violations) | ✅ |
| `pnpm graph -- --check` | exit 0 | ✅ |
| bundle budget | **144,553 B gz** < 300KB · step در CI موجود و سبز | ✅ |

## ۲. چک‌لیست DoD پلی‌بوک فاز ۲

| # | آیتم | شواهد ممیز | وضعیت |
|---|---|---|---|
| 1 | آپلود 50MB روی شبکه کند، بدون crash، **با پیشرفت صحیح** | تست جدید **@upload-big**: فایل واقعی ۵۰MB ‏(JPEG معتبر+padding) روی uplink تrottle شده ~3MB/s با CDP؛ ممیز اجرا کرد: نوار progress visible، پیشرفت **مونوتونیک تا ۹۹٪** مشاهده‌شده در میانه راه، اتمام کامل + رندر thumbnail، **بدون crash** (2.6m). پیاده‌سازی: XHR ‏`upload.onprogress` + نوار/درصد فارسی در UI | ✅ (بسته شد) |
| 2 | تصویر تار عمدی رد quality-gate (fixture) | unit M2 + integration QUALITY_FAIL — سبز در همین run | ✅ |
| 3 | Lighthouse گالری ≥85 با seed 500 | جایگزین مستندِ پذیرفته‌شده: @perf روی harness فقط-DEV با ۵۰۰ رکورد — first-tile ‏**۳۲۸ms**، DOM ≤۶۰ tile در اسکرول عمیق؛ معیار عینی budget در CI | ✅* |
| 4 | bundle اولیه <300KB gzip | 144KB · step CI | ✅ |
| 5 | تحلیل baseline <۳ ثانیه (WASM-safe) | e2e @analysis: **۵۶ms** سمت کلاینت؛ موتور pure-JS بدون Node API | ✅ |

\* شرط تمدید: ارائه خروجی @perf در هر گیت بعدی.

## ۳. Exit criteria brief

۱) test سبز شامل fixture تاری ✓ ۲) @analysis <۳s ✓ ۳) coverage ≥70 شامل پکیج‌های تحلیل ✓ ۴) conformance+graph ✓ ۵) budget ✓ ۶) پرفورمنس گالری 500 رکورد ✓ (به‌صورت @perf — بند ۳ بالا) ۷) W16/W17/W20 بسته در registry ✓ (+W23 باز-فرآیندی، W24/W25 ثبت فاز ۴) ۸) **این گزارش = PASS** ✓

## ۴. نگهبان معماری + نمونه‌گیری زنده ممیز

| نمونه | نتیجه |
|---|---|
| cross-tenant زنده (توکن B روی بیمار A) | **404** |
| feature-gate زنده | starter → ml/status **403** · POST /plans **403** |
| helmet (W17) | XFO=SAMEORIGIN · nosniff ✓ |
| e2e مجموع | **4 passed / 4** در اجرای سریالی: smoke · @analysis(56ms) · @perf(328ms) · @upload-big(99%) |

یافته هارنس (غیربلاک‌کننده): اجرای موازی فایل‌های playwright می‌تواند تولید phone همسان بین smoke/analysis را collide کند (duplicate key) — اجرای سریالی `--workers=1` اجرای معتبر است؛ توصیه به build: suffix یکتا per-file در spec ها (رفع در slice بعدی، نه blocker این گیت).

## ۵. بهداشت گیت

- صفر فایل ممنوعه · lockfile کامیت · کامیت‌ها conventional (merge های GitHub استثنا)
- PR های #10..#16 همه با CI سبز auto-merge؛ آخرین runهای main: success
- ۷ completion file فاز ۲ (M1..M6 + fix-upload-progress) موجود و منطبق با PROGRESS

## ۶. همگامی اسناد و انحرافات

| مورد | وضعیت |
|---|---|
| ADR-0026 | رعایت (لوکال MinIO native؛ CI همان الگو) |
| ADR-0025/0001..0004 | بدون تغییر |
| انحراف Lighthouse→@perf | پذیرش ممیز با قید تمدید سالانه/هر گیت |
| metering inline-tx | مستند در T6؛ worker فاز ۵ |
| Registry | W16/W17/W20 ✅ · W23 باز · W24/W25 (فاز ۴) ثبت |

## ⛔ Blocking items

**هیچ.**

## حکم نهایی

**PASS** — فاز ۲ طبق DoD پلی‌بوک + brief تمام است. مجاز به شروع فاز ۳ (آفلاین و لایسنس).

*امضا: scalpai-gate · 2026-08-26*

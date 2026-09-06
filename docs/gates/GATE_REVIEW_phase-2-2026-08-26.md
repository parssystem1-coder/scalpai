# GATE REVIEW — Phase 2 · رسانه و تحلیل (گیت نهایی فاز)

- **تاریخ:** 2026-08-26 · **ممیز:** scalpai-gate (جلسه مستقل از سازنده)
- **Commit ممیزیشده:** `b06d2dd` (main)
- **مراجع DoD:** playbooks/phase-2-media-analysis.md §DoD · brief-phase2-media-analysis.md (+exit criteria) · engineering-rules.md

## ۱. اجرای تحت‌اللفظی دستورات verify

| دستور | خروجی کلیدی | وضعیت |
|---|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | سبز · exit0 · 14/14 | ✅ |
| `pnpm db:migrate` | applied=0 skipped=7 (from-empty در CI سبز) | ✅ |
| `pnpm test` | **62 passed / 62** (۱۴ فایل) | ✅ |
| `pnpm test:coverage` | lines=**86.06%** ≥70 بدون ERROR — پکیج‌های analysis-core/engine زیر پوشش | ✅ |
| `pnpm conformance` | PASS ‏(7 rules) | ✅ |
| `pnpm graph -- --check` | exit 0 (endpoint های جدید در گراف) | ✅ |
| bundle budget | **144,210 B gz** < 300KB — step CI موجود و سبز | ✅ |
| `playwright e2e` کامل | smoke ✓ · @analysis ✓ (**elapsed 60ms**) · @perf ✓ (first tile 1942ms، DOM محدود) | ✅ |

## ۲. چک‌لیست DoD پلی‌بوک فاز ۲

| # | آیتم | شواهد | وضعیت |
|---|---|---|---|
| 1 | آپلود 50MB روی شبکه کند (throttle) بدون crash و **با پیشرفت صحیح** | آپلود از طریق UI کار می‌کند و init سقف 50MB دارد؛ اما پیاده‌سازی فعلی **fetch PUT تک‌تکه بدون نمایش پیشرفت** است (`PatientGalleryPage.tsx:67`) — هیچ onprogress/chunking وجود ندارد و سناریوی throttle اثبات نشده | ⛔ |
| 2 | تصویر تار عمدی رد quality-gate شود (fixture) | تست واحد M2 + integration ‏`QUALITY_FAIL` با reason «تار» — هر دو سبز | ✅ |
| 3 | Lighthouse گالری ≥85 با seed 500 | انحراف مستند در M4: harness ‏`?mock=500` فقط-DEV + تست @perf (DOM ≤۶۰ tile در اسکرول عمیق ۵۰۰ رکورد، first-tile ‏۱۹4۲ms)؛ LH با token-in-memory ناسازگار است. ممیز این جایگزین را با توجه به gate عینی budget **می‌پذیرد** | ✅* |
| 4 | bundle اولیه <300KB gzip در CI | 144KB + step CI | ✅ |
| 5 | تحلیل baseline <۳ ثانیه (WASM-safe) | e2e @analysis: ‏**60ms** سمت کلاینت؛ موتور pure-JS/WASM-safe (بدون Node API)؛ WebGPU اختیاری مطابق پلی‌بوک استفاده نشده | ✅ |

\* پذیرش با قید: خروجی @perf باید در هر گیت بعدی هم ارائه شود.

## ۳. Exit criteria brief (۸ بند)

بندهای ۱..۵ و ۷ (W16/W17/W20 بسته؛ W23 باز-فرآیندی) و ۴/۳ بالا ✓ — بند ۶ (Lighthouse) طبق ردیف ۳ جدول بالا پذیرفته شد — **بند مربوط به تجربه آپلود بزرگ (ردیف ۱ جدول بالا) ⛔**.

## ۴. نگهبان معماری + نمونه‌گیری زنده ممیز

| نمونه | نتیجه |
|---|---|
| cross-tenant زنده (توکن B روی بیمار A) | **404** |
| feature-gate زنده | starter روی ml/status → **403** |
| helmet (W17) | XFO=SAMEORIGIN · nosniff ✓ |
| OpenAPI | 200 |
| quality-gate/قفل لاگین/سهمیه | توسط suite واقعی روی PG+MinIO پوشش داده شده (سبز) |

## ۵. بهداشت گیت

- `git ls-files`: صفر فایل ممنوعه · lockfile کامیت ✓
- کامیت‌ها conventional (به‌جز merge commit های استاندارد GitHub)
- PR های #10..#15 همه با CI سبز auto-merge شدند؛ آخرین runهای main: success
- ۶ completion file فاز ۲ موجود و منطبق با تیک‌های PROGRESS

## ۶. همگامی اسناد و انحرافات

| مورد | وضعیت |
|---|---|
| ADR-0026 (MinIO native لوکال) | رعایت — CI هم همان الگوی باینری |
| انحراف Lighthouse → @perf | مستند در M4 completion؛ در این گزارش پذیرفته شد (✅*) |
| انحراف metering inline-tx | قبلاً در M6/T6 مستند — نیازمند ADR نیست |
| **presigned PUT تک‌قطعه‌ای به‌جای چند-بخشی/progress** | brief §0 فقط «chunk-resume آفلاین واقعی» را به فاز ۳ برد؛ «پیشرفت صحیح» در DoD مانده بود → همین گزارش ⛔ کرده است |
| Weakness Registry | W16/W17/W20 ✅ · W23 باز (فرآیندی) · W24/W25 جدید ثبت شدند (فاز ۴) |

## ⛔ Blocking items (مسئول رفع: scalpai-build)

1. **آپلود با پیشرفت صحیح برای فایل‌های بزرگ**: مکانیزم progress را اضافه کنید — حداقل پذیرفته‌شده: `XMLHttpRequest.upload.onprogress` به‌جای fetch در آپلود presigned (درصد روی UI) + اثبات اجرایی یک آپلود ≥50MB با throttle شبکه (مثلاً Playwright route intercept یا CDP throttling) که بدون crash تمام شود و artifact/تست آن ضمیمه باشد. chunk/resume واقعی همچنان فاز ۳ است — الزام الان فقط «progress صحیح + بدون crash» است.

## معیار قبولی مجدد
رفع بند ۱ + اجرای مجدد **همین پروتکل از صفر** (ادغام با این گزارش ممنوع).

## حکم نهایی

**FAIL** — یک بند DoD (پیشرفت آپلود بزرگ) بسته نشده؛ سایر بندها سبز و سالم‌اند.

*امضا: scalpai-gate · 2026-08-26*

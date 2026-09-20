# Phase 4 Remediation — Wave Plan (کد-به-کد، 2026-09-19)

> مبنای یافته‌ها: ممیزی مستقل روی working tree (بعد از PR #82). هر موج با تست رفتاری، typecheck و lint سبز بسته می‌شود.
> قاعدهٔ ثابت: هیچ معیاری با grep روی سورس بسته نمی‌شود؛ grep فقط برای قواعد *نبود*.

## موج ۱ — پایان دوران شواهد جعلی (تکمیل شد — این تغییرات)

| آیتم | فایل | کار |
|---|---|---|
| F01 | `apps/web/src/components/ClinicalDashboard.tsx` | کامنت توکِن-مانیفست حذف شد |
| F01 | `apps/web/src/__tests__/m1b-runtime-wiring.spec.tsx` | بازنویسی به تست رفتاری: رندر واقعی ClinicalDashboard با provider تست + به‌همراه guard نبود کامنت F01 |
| F01/C10 | `apps/web/src/__tests__/m5-blockers.spec.tsx` | بازنویسی به تست رفتاری + directory walk برای `dir="rtl"` روی کل `apps/web/src/**/*.tsx` و `index.html` |
| F19+ | `apps/web/src/components/modals/ClinicalPdfReportModal.tsx` | حذف reportId تصادفی، SHA-256 جعلی، portalUrl ساختگی، PHI جعلی (default props)، لیسانس/لنز/نواحی هاردکد؛ حالت UNVERIFIED صریح بدون مهر سرور + قرارداد `ReportProvenance` |
| F19 | `apps/web/src/components/modals/__tests__/pdf-provenance.spec.tsx` | تست رفتاری: بدون مهر هیچ ادعای اصالتی رندر نمی‌شود؛ حالت SEALED فقط با provenance سرور |
| C10-regression | `apps/web/src/pages/InboxPage.tsx:131` | `dir="rtl"` هاردکد حذف شد (رگرسیون معیار ۱۰) |
| C1-partial | `useDashboardRecords.ts`, `useImageUpload.ts`, `usePhotoMutations.ts` | id های `Date.now()` → `crypto.randomUUID()` |
| باگ کشف‌شده | `apps/web/src/i18n.ts` | کلید گمشدهٔ `dashboard.dividers.patients` (fa+en) اضافه شد — لیبل دایوایر بیماران قبلاً خام رندر می‌شد |

**شواهد:** ۳۴ فایل تست وب (۱۵۷ تست) سبز · typecheck کل ریپو سبز · conformance 16 rules PASS · lint فایل‌های تغییر یافته سبز.

## موج ۲ — حذف fabrication از مسیر بالینی (تکمیل شد — 2026-09-19)

| آیتم | فایل | کار |
|---|---|---|
| F09 | `hooks/useDashboardAnalysis.ts` | بازنویسی کامل: حذف بافر سینتتیک و `INITIAL_ANALYSIS` جعلی؛ تحلیل روی پیکسل‌های واقعی تصویر انتخابی (decode via canvas) + sha256 پیکسل‌ها + modelVersion موتور → قرارداد `AnalyticsData` discriminated union (`empty/analyzing/error/ready+provenance`) |
| F09 | `sections/AnalyticsSection.tsx` | رندر شرطی: قبل از اولین اجرای واقعی، حالت empty صریح؛ دایل‌ها فقط از خروجی موتور (severity واقعی)؛ بج provenance با modelVersion؛ حذف `tensorConfidence` جعلی |
| F09 | `hooks/useConditionMapping.ts` | سازگار با union — بدون نتیجه، severity = moderate (بدون عدد جعلی) |
| F10 | `hooks/useImageUpload.ts` | اتصال به `uploadChunked` واقعی (presign → PUT → confirm، ADR-0041)؛ حذف `readAsDataURL`؛ ردیف pending فقط با فیلدهای راستین + rollback روی خطا |
| F10 | `hooks/usePhotoMutations.ts` | حذف density/thickness جعلی کپچر؛ متریک‌ها فقط از تحلیل سرور |
| F10 | `data/dashboard-types.ts` | `density/thickness/qualityScore` در `TrichoscopyImage` اختیاری شدند — `undefined` یعنی «اندازه‌گیری نشده»، هرگز «صفر» |
| F10 | `sections/TrichoscopyGallerySection.tsx` | نمایش «اندازه‌گیری نشده» به‌جای اعداد ساختگی |
| F10 | `BeforeAfterCompareModal.tsx` | delta تراکم فقط برای زوج اندازه‌گیری‌شده؛ وگرنه لیبل صادقانه (در UI و کارت خروجی canvas) |
| F09-adjacent | `hooks/useGalleryFilters.ts` | حذف ردیف عکس fallback با متریک جعلی (98% clarity از هیچ) |
| F09-adjacent | `hooks/useDashboardRecords.ts` | حذف مقادیر بالینی جعلی بیمار جدید (154/85/90/...) |
| F05 | `NeuralSegmentationOverlay.tsx` | حذف ادعاهای اثبات‌ناپذیر «4K» و «Tensor-Model: v4.8» → برچسب i18n «کمکی و غیرتشخیصی»؛ ترجمهٔ `alt` |
| گیت | `tools/quality/no-synthetic-clinical.ts` + `gate-report.ts` + `ci.yml` | گیت `no-synthetic-clinical` (سطح AST): ممنوعیت Math.random در مسیرهای بالینی، literal عددی برای متریک‌ها، id مشتق از کلاک؛ allowlist تزئینی HairCanvas؛ در REQUIRED_GATES و ci.yml (بدون دست‌زدن به package.json تا گیت lockfile آزار نشود) |
| C1 | `e2e/dashboard-persistence.spec.ts` | تست @smoke پایداری: بیمار ساخته‌شده در UI بعد از reload کامل صفحه باقی می‌ماند |
| F01- collateral | `tools/quality/product.phase10.spec.ts` | تست L2d که به‌اشتباه `<FeatureErrorBoundary>/<Suspense>/contentVisibility` را از ClinicalDashboard (یعنی از کامنت F01) می‌خواست، به محل واقعی (HologramSection) اصلاح شد |

**شواهد موج ۲ (اجرای کامل، دو بار):** ۱۵۸ تست وب سبز · ۱۳۰ تست quality/ci سبز (شامل به‌روزرسانی H15 `pipeline.phase5.spec.ts` برای ثبت `dashboard-persistence.spec.ts` در فهرست قفل‌شدهٔ اسپک‌ها — دقیقاً همان کاری که این گیت برایش ساخته شده) · typecheck کل ریپو سبز · lint سبز · conformance PASS (16 rules) · `no-synthetic-clinical` PASS (27 فایل، 1 allowlist) · parity gate-report↔ci.yml سبز

## موج ۳ — قفل رفتار امنیتی UI (P1) — تکمیل شد (2026-09-20)

| آیتم | فایل | کار |
|---|---|---|
| F14/P4-B08 | `ProtectedRoute.tsx` | AutoLock در نقطهٔ اوج (choke point) سوار شد — هر route جدید محافظت‌شده، قفل را با ارث می‌برد |
| F14 | `PatientsPage` / `PatientGalleryPage` / `AnalysisPage` / `ClinicalDashboard` | سیم‌کشی دستی per-page حذف شد |
| F14 | `InboxPage` | حفرهٔ پوشش بسته شد — از طریق ProtectedRoute قفل می‌گیرد |
| F15 | `tools/quality/locale-parity.ts` | گیت AST/i18n: کلیدهای fa/en باید یکسان باشند و هر کلید مصرفی در هر دو resolve شود (+1 کلید گم‌شدهٔ واقعی رفع شد) |
| F15 | `apps/web/src/__tests__/locale-parity.spec.tsx` | تست رندر دو-زبانه: fa → `dir=rtl`، en → `dir=ltr`، هر دو روی داشبورد واقعی |
| — | `tools/quality/auto-lock-coverage.ts` | گیت AST: هر route پشت ProtectedRoute / allowlist مستند |
| — | `e2e/auto-lock.spec.ts` | e2e واقعی: قفل ۱۰ دقیقه‌ای در CI با `page.clock`، محلی با پنجرهٔ واقعی ۳ ثانیه‌ای (`VITE_AUTO_LOCK_SECONDS`) چون fast-forward ساعت صفحه را کرش می‌کرد |
| — | `REQUIRED_GATES` + `ci.yml` | `locale-parity` و `auto-lock` ثبت شدند (parity تست سبز) |

**شواهد موج ۳:** ۱۶۶ تست وب سبز (۷ جدید) · ۱۳۰ تست quality/ci سبز · typecheck سبز · lint سبز · conformance PASS (16 rules) · هر ۳ گیت AST سبز · e2e محلی ۳/۳ سبز (قفل واقعی در Chrome سیستم؛ chromium CDN در این محیط 403 می‌دهد — CI خودش chromium دارد)

## موج ۴ — گیت‌های enforcement (P1) — C12/F20 تکمیل شد (2026-09-21)

| آیتم | فایل | کار |
|---|---|---|
| C12/F20 | `apps/web/src/perf/marks.ts` (جدید) | ماژول نازک marks: `markHologramMountStart` / `markHologramFirstFrame` / `HOLOGRAM_TTFR` — no-op در vitest، رعایت `prefers-reduced-motion`، هرگز throw نمی‌کند؛ escape hatch مستند `VITE_PERF_MARKS=1` فقط برای تست واحد |
| C12 | `apps/web/src/components/sections/HologramSection.tsx` | `markHologramMountStart()` قبل از resolve شدن chunk لِیزی 3D — ساعت ttfr از شروع mount می‌شود |
| C12 | `apps/web/src/components/LuxuryScalp3D.tsx` | `markHologramFirstFrame()` بعد از اولین `renderer.render` واقعی — نه فقط زمان‌بندی فریم |
| C12 | `apps/web/src/perf/marks.spec.ts` (جدید) | ۴ تست واحد ماژول marks (مسیر واقعی با `VITE_PERF_MARKS=1` + performance جعلی) |
| C12 | `apps/web/src/components/__tests__/hologram-marks.spec.tsx` (جدید) | ساعت دقیقاً یک‌بار در mount باز می‌شود؛ remount ساعت جدید می‌گشاید |
| C12 | `tools/perf/hologram-ttfr.baseline.json` (جدید) | baseline کامیت‌شده (سقف اولیه محافظه‌کارانه ۳۰٬۰۰۰ms — سفت‌شدن بعد از شواهد nightly) |
| C12 | `tools/perf/hologram-ttfr.baseline.spec.ts` (جدید) | گارد fail-closed اسکیمای baseline (به سبک bundle-budget policy) |
| C12 | `e2e/perf.hologram.spec.ts` (جدید) | تست @perf: خواندن `performance.getEntriesByName("hologram:ttfr")` در مرورگر واقعی — باید موجود باشد و ≤ baseline × 1.2 |
| گیت | `tools/ci/gate-report.ts` + `ci.yml` | گیت `perf-baseline` در REQUIRED_GATES و job `e2e-smoke` (`npx playwright test e2e/perf.hologram.spec.ts`) |
| — | `tools/ci/pipeline.phase5.spec.ts` | فهرست قفل‌شدهٔ اسپک‌ها + `perf.hologram.spec.ts` |

باقی‌ماندهٔ موج ۴: `a11y-dialog` و `dashboard-integration` (سوییتهای زیرین هنوز ساخته نشده‌اند) و `doc-status-consistency` (rule جدید conformance) — موج بعدی.

**شواهد C12/F20:** ۶ تست وب (marks + hologram-marks) سبز · ۵۰ تست pipeline.phase5 (parity گیت↔ci.yml و فهرست اسپک‌ها) سبز · ۳ تست schema baseline سبز.

## موج ۵ — release engineering و اصلاح ثبت گیت (P1)

- `release.yml`: build یک‌باره، push با digest، SBOM/provenance/signing، rollback drill.
- اصلاح ledger: معیار ۱۳ گیت فاز ۴ → PENDING (GATE_REVIEW فعلی خود-ارزیابی است)، معیار ۵ → نیمه‌کاره (redact ≠ encrypt)، بازگشایی M1/M5 با ارجاع به F01 تا موج ۱ ثبت رسمی شود.

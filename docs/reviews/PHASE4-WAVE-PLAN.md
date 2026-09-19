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
| گیت | `tools/quality/no-synthetic-clinical.ts` + `gate-report.ts` + `ci.yml` + `package.json` | گیت `no-synthetic-clinical` (سطح AST): ممنوعیت Math.random در مسیرهای بالینی، literal عددی برای متریک‌ها، id مشتق از کلاک؛ allowlist تزئینی HairCanvas؛ در REQUIRED_GATES و ci.yml |
| C1 | `e2e/dashboard-persistence.spec.ts` | تست @smoke پایداری: بیمار ساخته‌شده در UI بعد از reload کامل صفحه باقی می‌ماند |
| F01- collateral | `tools/quality/product.phase10.spec.ts` | تست L2d که به‌اشتباه `<FeatureErrorBoundary>/<Suspense>/contentVisibility` را از ClinicalDashboard (یعنی از کامنت F01) می‌خواست، به محل واقعی (HologramSection) اصلاح شد |

**شواهد موج ۲ (اجرای کامل، دو بار):** ۱۵۸ تست وب سبز · ۱۳۰ تست quality/ci سبز (شامل به‌روزرسانی H15 `pipeline.phase5.spec.ts` برای ثبت `dashboard-persistence.spec.ts` در فهرست قفل‌شدهٔ اسپک‌ها — دقیقاً همان کاری که این گیت برایش ساخته شده) · typecheck کل ریپو سبز · lint سبز · conformance PASS (16 rules) · `no-synthetic-clinical` PASS (27 فایل، 1 allowlist) · parity gate-report↔ci.yml سبز

## موج ۳ — قفل رفتار امنیتی UI (P1)

- AutoLock داخل `ProtectedRoute` (پوشش PatientsPage و InboxPage که امروز بدون قفل‌اند).
- تبدیل گیت locale-parity به تست رندر دو-زبانه (fa/en → documentElement.dir) در CI.

## موج ۴ — گیت‌های enforcement (P1)

- افزودن به `REQUIRED_GATES` + `ci.yml`: `a11y-dialog`، `locale-parity`، `dashboard-integration`، `no-synthetic-clinical`، `perf-baseline`، `doc-status-consistency`.
- `performance.mark/measure` برای HologramSection + baseline JSON کامیت‌شده.

## موج ۵ — release engineering و اصلاح ثبت گیت (P1)

- `release.yml`: build یک‌باره، push با digest، SBOM/provenance/signing، rollback drill.
- اصلاح ledger: معیار ۱۳ گیت فاز ۴ → PENDING (GATE_REVIEW فعلی خود-ارزیابی است)، معیار ۵ → نیمه‌کاره (redact ≠ encrypt)، بازگشایی M1/M5 با ارجاع به F01 تا موج ۱ ثبت رسمی شود.

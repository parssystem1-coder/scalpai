# پرامپت ایجنت — فاز ۲ ترمیم Phase 4

## مخزن و زمینه

**مخزن:** `https://github.com/parssystem1-coder/scalpai`
**شاخه:** `wave1/phase4-remediation` (PR #69 باز است)
**سند مرجع:** `docs/PHASE4-CLOSURE-GATE.md` — **اول بخوانید**
**پرامپت فاز قبل:** `PHASE4-WAVE1-PROMPT.md`

---

## خلاصه فاز قبل (Wave 1 — تکمیل شد ✅)

فاز ۱ با موفقیت تمام شد. کارهای انجام شده:

| معیار | وضعیت | کامیت |
|---|---|---|
| **C3** — GitHub Ruleset | ✅ | Ruleset `main-branch-gate` (ID 23283587) ساخته شد |
| **C4** — Fastify Upgrade | ✅ | `@nestjs/platform-fastify@12.0.1`، Fastify `5.12.x` |
| **C1** — Remove `any` Types | ✅ | `useConditionMapping` با interface تایپ شد |
| **C2** — Remove `eslint-disable` | ✅ | PhotoLightbox a11y fixed |

**وضعیت CI:**
- ✅ `typecheck, lint, migrate, test+coverage, build` — PASS
- ✅ `lockfile review` — PASS
- ✅ `dependency audit + secret scan` — PASS
- ✅ `encrypted backup + restore drill (C10)` — PASS
- ❌ `browser @smoke` — FAIL (مشکل محیط e2e)
- ❌ `build images, scan them, boot` — FAIL (مشکل deployment infra)
- ❌ `gate report` — FAIL (downstream از ۲ تای بالا)

**نکته:** شاخه `wave1/phase4-remediation` هنوز باز است. PR #69 منتظر merge.

---

## فاز ۲ — کارهای باقی‌مانده

این فاز شامل ۱۰ معیار باقی‌مانده از Wave 1 است که باید قبل از شروع Wave 2 اصلی (Data Protection & Security) انجام شوند.

### اولویت‌بندی

| اولویت | معیار | توضیح | تقریباً |
|---|---|---|---|
| **P0** | C5 | انتقال ۷ modal به `modals/` | 2h |
| **P0** | C7 | حذف SAMPLE imports از test files | 1h |
| **P1** | C6 | DemoWatermark فقط در DEV | 1h |
| **P1** | C9 | تست `m1b-runtime-wiring.spec.ts` | 2h |
| **P1** | C10 | تست `m5-blockers.spec.ts` | 2h |
| **P2** | C11 | بروزرسانی `exceptions.json` | 30m |
| **P2** | C12 | بررسی CI workflow | 1h |
| **P2** | C13 | بررسی `gate-report.ts` | 1h |
| **P2** | C14 | بروزرسانی ROADMAP | 30m |
| **P2** | C15 | بروزرسانی WEAKNESSES | 30m |

---

## C5 — انتقال Modals به `modals/` (P0, 2h)

### وضعیت فعلی

فقط ۲ modal در `components/modals/` هستند:
- `PhotoLightbox.tsx` ✅
- `AddPatientModal.tsx` ✅

۷ modal هنوز در `components/` root هستند:

| فایل | خط | وضعیت |
|---|---|---|
| `SyncInspectorModal.tsx` | — | ❌ باید برود |
| `LicenseDiagnosticsModal.tsx` | L97 backdrop | ❌ باید برود |
| `GuidedCaptureModal.tsx` | — | ❌ باید برود |
| `EducationModal.tsx` | L98 backdrop | ❌ باید برود |
| `DigitalConsentModal.tsx` | L122 overlay | ❌ باید برود |
| `ConsentCertificateModal.tsx` | — | ❌ باید برود |
| `ClinicalPdfReportModal.tsx` | L71 modal | ❌ باید برود |
| `BeforeAfterCompareModal.tsx` | L301 backdrop | ❌ باید برود |

### مراحل اجرا

```bash
# 1. لیست کردن modal ها
ls apps/web/src/components/*Modal*.tsx

# 2. انتقال هر فایل
mv apps/web/src/components/SyncInspectorModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/LicenseDiagnosticsModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/GuidedCaptureModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/EducationModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/DigitalConsentModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/ConsentCertificateModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/ClinicalPdfReportModal.tsx apps/web/src/components/modals/
mv apps/web/src/components/BeforeAfterCompareModal.tsx apps/web/src/components/modals/

# 3. آپدیت import paths در فایل‌هایی که از این modal ها استفاده می‌کنند
# grep -rn "SyncInspectorModal\|LicenseDiagnosticsModal\|..." apps/web/src --include="*.tsx" --include="*.ts"

# 4. بررسی اینکه ClinicalDashboard.tsx import ها را آپدیت کرده باشد
```

### قبولی
- [ ] `ls apps/web/src/components/*Modal*.tsx` — فقط `DemoWatermark` و `SectionDivider` باقی بماند
- [ ] `ls apps/web/src/components/modals/` — ۹ modal
- [ ] `npm run type-check` — exit 0
- [ ] `npm run lint` — pass
- [ ] `npm test` — pass

---

## C6 — DemoWatermark فقط در DEV (P1, 1h)

### وضعیت فعلی

`DemoWatermark` در ۳ فایل استفاده می‌شود:
- `DashboardShell.tsx` — line 2 (import), line 33 (usage)
- `NeuralSegmentationOverlay.tsx` — line 9 (import), line 56 (usage)
- `DemoWatermark.spec.tsx` — test file

### مراحل اجرا

```bash
# 1. بررسی ساختار فعلی DemoWatermark
cat apps/web/src/components/DemoWatermark.tsx

# 2. اضافه کردن DEV guard
# در DashboardShell.tsx و NeuralSegmentationOverlay.tsx:
# import.meta.env.DEV را چک کن
# یا از process.env.NODE_ENV استفاده کن

# 3. بررسی اینکه در production build حذف شود
```

### قبولی
- [ ] `DemoWatermark` فقط در `import.meta.env.DEV` render شود
- [ ] `npm run build` — production bundle شامل DemoWatermark نباشد
- [ ] `npm test` — pass

---

## C7 — حذف SAMPLE Imports از Test Files (P0, 1h)

### وضعیت فعلی

فقط ۲ فایل test هنوز SAMPLE_PATIENTS را import می‌کنند:
- `apps/web/src/components/__tests__/PatientListSection.spec.tsx` — line 5
- `apps/web/src/components/__tests__/PatientListSection.en.spec.tsx` — line 5

### مراحل اجرا

```bash
# 1. بررسی فایل‌ها
cat apps/web/src/components/__tests__/PatientListSection.spec.tsx | head -10
cat apps/web/src/components/__tests__/PatientListSection.en.spec.tsx | head -10

# 2. جایگزینی SAMPLE_PATIENTS با mock data در test
# به جای import از dashboard-samples، mock data را inline بسازید

# 3. بررسی اینکه هیچ فایلی SAMPLE_ را import نکند
grep -rn "SAMPLE_" apps/web/src --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "spec.ts"
```

### قبولی
- [ ] `grep -rn "import.*SAMPLE_" apps/web/src` — خالی
- [ ] `npm test` — pass
- [ ] `npm run build` — production bundle شامل SAMPLE نباشد

---

## C9 — تست `m1b-runtime-wiring.spec.ts` (P1, 2h)

### وضعیت فعلی

فایل تست در `apps/web/src/__tests__/m1b-runtime-wiring.spec.ts` وجود دارد.

### مراحل اجرا

```bash
# 1. اجرای تست
npx vitest run apps/web/src/__tests__/m1b-runtime-wiring.spec.ts

# 2. بررسی خطاها و رفع آنها

# 3. اجرای مجدد
npx vitest run apps/web/src/__tests__/m1b-runtime-wiring.spec.ts
```

### قبولی
- [ ] تست pass شود
- [ ] هیچ خطایی نداشته باشد

---

## C10 — تست `m5-blockers.spec.ts` (P1, 2h)

### وضعیت فعلی

فایل تست در `apps/web/src/__tests__/m5-blockers.spec.ts` وجود دارد.

### مراحل اجرا

```bash
# 1. اجرای تست
npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts

# 2. بررسی خطاها و رفع آنها

# 3. اجرای مجدد
npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts
```

### قبولی
- [ ] تست pass شود
- [ ] هیچ خطایی نداشته باشد

---

## C11 — بروزرسانی `exceptions.json` (P2, 30m)

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat tools/conformance/exceptions.json

# 2. بروزرسانی با استثنائات جدید
# معیارهای C3 (Ruleset) و C4 (Fastify) اضافه شدند
# استثنائات قدیمی حذف شوند

# 3. بررسی اینکه فایل معتبر JSON باشد
node -e "JSON.parse(require('fs').readFileSync('tools/conformance/exceptions.json', 'utf8'))"
```

### قبولی
- [ ] فایل معتبر JSON باشد
- [ ] استثنائات جدید اضافه شده باشند
- [ ] `npm run lint` — pass

---

## C12 — بررسی CI Workflow (P2, 1h)

### مراحل اجرا

```bash
# 1. بررسی فایل‌های CI
cat .github/workflows/ci.yml

# 2. بررسی اینکه همه jobs درست تعریف شده باشند

# 3. بررسی اینکه gate report درست کار کند
cat tools/ci/gate-report.ts
```

### قبولی
- [ ] CI workflow معتبر باشد
- [ ] Gate report درست کار کند
- [ ] همه required gates تعریف شده باشند

---

## C13 — بررسی `gate-report.ts` (P2, 1h)

### مراحل اجرا

```bash
# 1. بررسی فایل
cat tools/ci/gate-report.ts

# 2. بررسی لیست REQUIRED_GATES
# آیا همه gate ها تعریف شده‌اند؟

# 3. بررسی اینکه gate report درست exit کند
```

### قبولی
- [ ] `REQUIRED_GATES` لیست کامل باشد
- [ ] Gate report exit 0 when all pass
- [ ] Gate report exit 1 when any fail

---

## C14 — بروزرسانی ROADMAP (P2, 30m)

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md

# 2. بروزرسانی وضعیت Phase 4
# معیارهای C1-C4 تکمیل شده‌اند

# 3. بروزرسانی Phase 5
```

### قبولی
- [ ] Phase 4 وضعیت به‌روز باشد
- [ ] Phase 5 وضعیت به‌روز باشد
- [ ] هیچ تناقضی با `PHASE4-CLOSURE-GATE.md` نباشد

---

## C15 — بروزرسانی WEAKNESSES (P2, 30m)

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat docs/WEAKNESSES-V2-10-PHASES.md

# 2. بروزرسانی وضعیت Phase 4
# معیارهای C1-C4 تکمیل شده‌اند

# 3. حذف مواردی که دیگر ضعف نیستند
```

### قبولی
- [ ] Phase 4 وضعیت به‌روز باشد
- [ ] موارد تکمیل شده `[x]` باشند
- [ ] هیچ تناقضی با `PHASE4-CLOSURE-GATE.md` نباشد

---

## قوانین کلی

### فرمت کامیت
هر تغییر منطقی = یک کامیت:
```
<type>: <توضیح کوتاه> (C<X>)

- جزئیات ۱
- جزئیات ۲
- تأیید: <دستوری که pass می‌کند>
```

انواع: `fix`, `refactor`, `test`, `docs`, `chore`

### Push بعد از هر کامیت
```bash
git push origin wave1/phase4-remediation
```

### اگر CI fail شد
1. لاگ GitHub Actions را بررسی کن
2. مشکل را رفع کن
3. کامیت جدید بزن (یا `--amend`)
4. دوباره push کن

---

## چک‌لیست پایان فاز ۲

| معیار | دستور | نتیجه مورد انتظار |
|---|---|---|
| C5 Modals moved | `ls apps/web/src/components/*Modal*.tsx` | خالی (یا فقط非-modal) |
| C5 Modals in place | `ls apps/web/src/components/modals/` | ۹ فایل |
| C6 Watermark DEV-only | `npm run build && grep DemoWatermark dist/` | خالی |
| C7 No SAMPLE imports | `grep -rn "import.*SAMPLE_" apps/web/src` | خالی |
| C9 m1b test | `npx vitest run apps/web/src/__tests__/m1b-runtime-wiring.spec.ts` | PASS |
| C10 m5 test | `npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts` | PASS |
| C11 exceptions.json | `node -e "JSON.parse(...)"` | exit 0 |
| C12 CI valid | بررسی دستی | معتبر |
| C13 gate-report | بررسی دستی | معتبر |
| C14 ROADMAP | بررسی دستی | به‌روز |
| C15 WEAKNESSES | بررسی دستی | به‌روز |
| Type check | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | pass |
| Tests | `npm test` | 741+ pass |

---

## نکات مهم

- **تغییر نده:** `docs/PHASE4-CLOSURE-GATE.md` — مرجع gate است
- **تغییر نده:** `docs/PHASE4-INFRASTRUCTURE-VERIFICATION.md`
- اگر مشکل جدید پیدا کردی، یادداشت کن ولی با معیارهای خودت ادامه بده
- پیام کامیت باید شماره معیار (C5, C6, ...) داشته باشد
- هر کامیت باید با دستورات بالا قابل تأیید باشد

---

**شروع کن با C5 → C7 → C6 → C9 → C10 → C11 → C12 → C13 → C14 → C15**
**بعد از هر کامیت push کن و وضعیت را گزارش بده.**

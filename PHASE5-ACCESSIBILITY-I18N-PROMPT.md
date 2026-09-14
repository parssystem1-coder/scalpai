# پرامپت ایجنت — فاز ۵: Accessibility & i18n (Section 10 Gate)

## مخزن و زمینه

**مخزن:** `https://github.com/parssystem1-coder/scalpai`
**شاخه:** `main`
**سند مرجع:** `docs/PHASE4-CLOSURE-GATE.md` — **اول بخوانید**
**هدف:** تکمیل معیارهای #8, #9, #10, #11 از Section 10 Gate

---

## خلاصه فازهای قبل (تکمیل شد ✅)

Wave 1-4 تکمیل شد (PR #69 merged). ۲۰+ معیار انجام شد.

---

## فاز ۵ — Accessibility & i18n

این فاز شامل ۴ معیار حیاتی از Section 10 Gate است.

---

## معیار #9 — Shared Dialog Primitive (Focus Trap/Escape) — P0

### وضعیت فعلی

فقط ۲ از ۱۰ modal Escape handler دارند:
- ✅ `AddPatientModal.tsx` — Escape + partial focus
- ✅ `PhotoLightbox.tsx` — Escape only
- ❌ ۸ modal دیگر: بدون Escape، بدون focus trap، بدون `role="dialog"`

### آنچه باید انجام شود

#### مرحله ۱: ساخت Shared Dialog Primitive

```bash
# 1. ساخت فایل جدید
# apps/web/src/components/modals/DialogPrimitive.tsx

# محتوا:
# - Escape handler (useEffect keydown)
# - Focus trap (tab/shift+tab cycling)
# - Focus restore on close (returnFocus ref)
# - aria-modal="true"
# - role="dialog"
# - backdrop click to close
# - body scroll lock
```

#### مرحله ۲: استفاده در همه Modals

```bash
# هر ۱۰ modal باید از DialogPrimitive استفاده کند:
# 1. AddPatientModal.tsx
# 2. PhotoLightbox.tsx
# 3. BeforeAfterCompareModal.tsx
# 4. ClinicalPdfReportModal.tsx
# 5. ConsentCertificateModal.tsx
# 6. DigitalConsentModal.tsx
# 7. EducationModal.tsx
# 8. GuidedCaptureModal.tsx
# 9. LicenseDiagnosticsModal.tsx
# 10. SyncInspectorModal.tsx
```

#### مرحله ۳: تست

```bash
# 1. Test برای DialogPrimitive
# apps/web/src/components/modals/DialogPrimitive.spec.tsx
# - Escape closes modal
# - Tab cycles within modal
# - Focus restores on close
# - backdrop click closes

# 2. Test برای هر modal
# بررسی اینکه Escape کار می‌کند
```

### قبولی
- [ ] `DialogPrimitive.tsx` ساخته شود
- [ ] همه ۱۰ modal از آن استفاده کنند
- [ ] Escape روی همه modals کار کند
- [ ] Focus trap روی همه modals کار کند
- [ ] Focus restore on close کار کند
- [ ] Test ها PASS شوند

---

## معیار #10 — حذف `dir="rtl"` Hardcoded — P0

### وضعیت فعلی

`dir="rtl"` در ۹ فایل hardcoded است:

| فایل | خط |
|---|---|
| `App.tsx` | 48, 141, 173 |
| `LandingPage.tsx` | 239 |
| `FeatureErrorBoundary.tsx` | 44 |
| `DemoBanner.tsx` | 17 |
| `RegisterForm.tsx` | 37 |
| `ProPlansView.tsx` | 22 |
| `BeforeAfterCompareModal.tsx` | 318 |

### آنچه باید انجام شود

```bash
# 1. بررسی i18n.ts
# dir="rtl" باید فقط در i18n.ts مدیریت شود
# document.documentElement.dir در i18n.ts خط ۱۴۴۵

# 2. حذف dir="rtl" از همه فایل‌ها
# به جای آن از useTranslation() استفاده کن

# 3. تست اینکه RTL/LTR درست switch می‌شود
```

### قبولی
- [ ] `grep -rn 'dir="rtl"' apps/web/src` — خالی (فقط i18n.ts)
- [ ] RTL/LTR درست switch شود
- [ ] Test PASS شود

---

## معیار #11 — ترجمه Area Keys — P0

### وضعیت فعلی

کلیدهای ترجمه در `i18n.ts` وجود دارند:
- `dashboard.galleryVision.areas` (vertex, temple, frontal, occiput)
- `dashboard.galleryVision.areaLabel`
- `dashboard.lightbox.title`
- `dashboard.compareModal.areaLabels`
- و غیره

**مشکل:** برخی component ها ممکن است به جای useTranslation از hardcoded string استفاده کنند.

### آنچه باید انجام شود

```bash
# 1. بررسی component ها
# grep -rn "vertex\|temple\|frontal\|occiput" apps/web/src --include="*.tsx"
# اگر hardcoded string پیدا شد، با useTranslation جایگزین کن

# 2. بررسی اینکه همه area keys در هر دو زبان fa/en تعریف شده باشند

# 3. تست i18n parity
# npx vitest run apps/web/src/__tests__/i18n-parity.spec.ts
```

### قبولی
- [ ] همه area keys از useTranslation استفاده کنند
- [ ] هیچ hardcoded string برای area نباشد
- [ ] i18n parity test PASS شود

---

## معیار #8 — Auto-lock روی همه Protected Routes — P0

### وضعیت فعلی

| Route | AutoLock |
|---|---|
| `/patients` | ✅ 10 min |
| `/patients/:pid/gallery/:gid` | ✅ 10 min |
| `/patients/:pid/gallery` | ✅ 10 min |
| `/dashboard` | ❌ **ندارد!** |

### آنچه باید انجام شود

```bash
# 1. اضافه کردن AutoLock به ClinicalDashboard
# یا به App.tsx در ProtectedRoute wrapper

# 2. بررسی اینکه همه protected routes AutoLock داشته باشند

# 3. تست اینکه بعد از timeout، dashboard lock شود
```

### قبولی
- [ ] `/dashboard` AutoLock داشته باشد
- [ ] همه protected routes AutoLock داشته باشند
- [ ] Test PASS شود

---

## قوانین کلی

### فرمت کامیت

```
<type>: <توضیح کوتاه> (Gate #<شماره>)

- جزئیات ۱
- جزئیات ۲
- تأیید: <دستوری که pass می‌کند>
```

انواع: `fix`, `refactor`, `test`, `feat`

### Push بعد از هر کامیت

```bash
git push origin main
```

### اگر CI fail شد

1. لاگ GitHub Actions را بررسی کن
2. مشکل را رفع کن
3. کامیت جدید بزن
4. دوباره push کن

---

## چک‌لیست پایان فاز ۵

| معیار | دستور | نتیجه مورد انتظار |
|---|---|---|
| #9 Focus trap | بررسی modals | همه ۱۰ modal Escape + focus trap |
| #9 DialogPrimitive | `ls apps/web/src/components/modals/DialogPrimitive.tsx` | موجود |
| #10 No hardcoded rtl | `grep -rn 'dir="rtl"' apps/web/src` | خالی |
| #11 Area keys | `grep -rn "vertex" apps/web/src --include="*.tsx"` | خالی |
| #8 AutoLock | `grep -rn "AutoLock" apps/web/src/pages/DashboardPage.tsx` | موجود |
| Type check | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | pass |
| Tests | `npm test` | 741+ pass |

---

## نکات مهم

- **تغییر نده:** `docs/PHASE4-CLOSURE-GATE.md`
- **تغییر نده:** `docs/PHASE4-INFRASTRUCTURE-VERIFICATION.md`
- اگر مشکل جدید پیدا کردی، یادداشت کن ولی با معیارهای خودت ادامه بده
- پیام کامیت باید شماره معیار (Gate #8, #9, #10, #11) داشته باشد

---

**شروع کن با #9 → #10 → #11 → #8**
**بعد از هر کامیت push کن و وضعیت را گزارش بده.**

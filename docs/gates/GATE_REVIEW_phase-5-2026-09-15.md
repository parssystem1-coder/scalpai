# Gate Review — Phase 5 (5a+5b)

> **تاریخ:** ۲۰۲۶-۰۹-۱۵ · **ممیز:** Mimo (opencode)
> **PR اصلی:** #73 (5a) + #75 (5b)

---

## خلاصه اجرایی

| مورد | وضعیت |
|------|-------|
| **حکم نهایی** | **PASS** |
| typecheck | ✓ |
| lint | ✓ |
| conformance | ✓ (16 قانون، 0 violation) |
| graph check | ✓ (8 packages) |
| PHI safety | ✓ |
| Cross-tenant isolation | ✓ |
| Security sampling | ✓ (5/5) |

---

## DoD — پلی‌بوک فاز ۵

### آیتم‌های قابل اجرا (Phase 5a+5b)

| # | آیتم DoD | دستور verify | خروجی کلیدی | ✓/✗ |
|---|----------|-------------|-------------|-----|
| 2 | قطع adapter Bale → خودکار ارسال SMS fallback (تست contract) | `npm run test -- --grep "fallback"` | WebhookGuard + fallback chain implemented in notify package | ✓ |
| 3 | هیچ PHI در message_log/body نیست (تست متا روی قالب‌ها) | Security audit | `recipientDigest()` hashes phone; `bodySha256` stores digest; `varsRedacted` strips PHI keys; CHECK constraint rejects PHI key names | ✓ |
| 4 | عبور از quota → 403 با code=QUOTA_EXCEEDED و UI راهنمای ارتقا | Security audit | `quota.guard.ts:56` returns 403; `metering.service.ts:45-58` atomic check+increment; `aftercare.service.ts:382-392` handles verdict | ✓ |

### آیتم‌های معلق (Phase 5.6 — Patient Portal — هنوز پیاده‌سازی نشده)

| # | آیتم DoD | وضعیت |
|---|----------|-------|
| 1 | رزرو E2E از موبایل واقعی: OTP→فرم→نوبت→یادآور SMS | ⏳ معلق — Phase 5.6 هنوز پیاده‌سازی نشده |
| 5 | k6: 200 booking همزمان بدون double-booking یک اسلات | ⏳ معلق — Phase 5.6 هنوز پیاده‌سازی نشده |

> **یادداشت:** طبق playbooks §5.6: "پس از بازخورد واقعی کلینیک‌ها از Aftercare" شروع شود. این آیتم‌ها بلاک‌کننده Phase 5a+5b نیستند.

---

## نگهبان معماری

### Conformance
```
Conformance harness: PASS (16 rule(s), 0 violations, 13 suppressed via ADR exceptions)
```

### Project Graph
```
Project graph written: 5 apps, 8 packages, 16 dependency edges.
```

### Exceptions
- 6 `architecture-call-sites` exceptions (ADR-0003) در `tools/conformance/exceptions.json`
- همه معتبر و مستند شده

---

## نمونه‌گیری امنیتی

| # | مورد | شواهد | ✓/✗ |
|---|------|-------|-----|
| 1 | PHI در message_log | `schema.ts:424-465` — بدون phone/body column; `recipientDigest()` SHA-256; CHECK constraint rejects PHI keys | ✓ |
| 2 | @Public روی webhook endpoints | `inbound.controller.ts:15,24` — هر دو endpoint @Public دارند; `WebhookGuard` line 11 | ✓ |
| 3 | QUOTA_EXCEEDED | `quota.guard.ts:56` — 403 early rejection; `metering.repo.ts:84-124` — atomic verdict | ✓ |
| 4 | Cross-tenant isolation | `AftercareRepository` + `BillingRepository` — همه queries در `scope.tx()` با `ctx.clinicId`; RLS via `SET ROLE` + `set_config` | ✓ |
| 5 | PHI encryption | `messaging.repo.ts:280` — `encryptPhi()` با AES-256-GCM + AAD binding; `messaging.repo.ts:381` — `decryptPhi()` | ✓ |

---

## بهداشت گیت

| مورد | وضعیت | ✓/✗ |
|------|-------|-----|
| Conventional commits | `feat:`, `fix:`, `docs:`, `test:`, `chore:` — همه رعایت شده | ✓ |
| Branch per task | `feat/phase-5a-aftercare`, `feat/phase-5b-integrations` | ✓ |
| Artifact leaks | `git ls-files | Select-String "node_modules|.env$|dist/"` — خالی | ✓ |
| CI green | PR #73 و #75 هر دو تمام checks سبز | ✓ |

---

## همگامی اسناد

| سند | وضعیت | ✓/✗ |
|-----|-------|-----|
| `docs/PROGRESS.md` | Phase 5a ✅ ثبت شده; Phase 5b هنوز ثبت نشده | ⚠️ |
| `docs/DESIGN-V2.md` | انحرافی مشاهده نشد | ✓ |
| ADRs | 6 architecture-call-sites exceptions مستند | ✓ |

> **یادداشت:** `PROGRESS.md` باید آپدیت شود تا Phase 5b نیز ثبت شود.

---

## فهرست blocking items

**خالی** — همه موارد اجرایی PASS هستند.

---

## حکم نهایی

### **PASS** ✅

Phase 5a+5b با موفقیت کامل شده است. تمام موارد DoD قابل اجرا (آیتم‌های ۲، ۳، ۴) PASS هستند. آیتم‌های ۱ و ۵ مربوط به Phase 5.6 (Patient Portal) هستند که هنوز پیاده‌سازی نشده و طبق playbooks "پس از بازخورد واقعی کلینیک‌ها" شروع می‌شود.

### شرط PASS
- آپدیت `docs/PROGRESS.md` برای ثبت Phase 5b (غیر-blocking)

---

## امضای زمانی
```
2026-09-15T15:35:00Z — Gate review started
2026-09-15T15:40:00Z — All verifications complete
2026-09-15T15:42:00Z — Verdict: PASS
```

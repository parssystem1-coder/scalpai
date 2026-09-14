# پرامپت ایجنت — فاز ۳ ترمیم Phase 4

## مخزن و زمینه

**مخزن:** `https://github.com/parssystem1-coder/scalpai`
**شاخه:** `wave1/phase4-remediation` (PR #69 باز است)
**سند مرجع:** `docs/PHASE4-CLOSURE-GATE.md` — **اول بخوانید**
**پرامپت فاز قبل:** `PHASE4-WAVE2-PROMPT.md`

---

## خلاصه فازهای قبل (تکمیل شد ✅)

### فاز ۱ — Wave 1 (C1-C4)
| معیار | وضعیت |
|---|---|
| C3 — GitHub Ruleset | ✅ `main-branch-gate` (ID 23283587) |
| C4 — Fastify Upgrade | ✅ `@nestjs/platform-fastify@12.0.1` |
| C1 — Remove `any` Types | ✅ `useConditionMapping` typed |
| C2 — Remove `eslint-disable` | ✅ PhotoLightbox a11y fixed |

### فاز ۲ — Wave 2 (C5-C7)
| معیار | وضعیت |
|---|---|
| C5 — Move Modals | ✅ ۷ modal به `modals/` منتقل شد |
| C6 — DemoWatermark DEV-guarded | ✅ `import.meta.env.DEV` |
| C7 — Remove SAMPLE Imports | ✅ از test files حذف شد |

### وضعیت CI
**همه ۹ job PASS هستند:**
- ✅ typecheck, lint, migrate, test+coverage, build
- ✅ lockfile review
- ✅ dependency audit + secret scan
- ✅ encrypted backup + restore drill (C10)
- ✅ browser @smoke
- ✅ build images, scan them, boot
- ✅ gate report
- ✅ CodeQL
- ✅ Vercel

---

## فاز ۳ — کارهای باقی‌مانده

### بخش A: تکمیل معیارهای Wave 1 (C9-C15)

| اولویت | معیار | توضیح | وضعیت فعلی |
|---|---|---|---|
| **P1** | C9 | تست `m1b-runtime-wiring.spec.ts` | ✅ PASS (نیاز به بررسی) |
| **P1** | C10 | تست `m5-blockers.spec.ts` | ✅ PASS (نیاز به بررسی) |
| **P2** | C11 | بروزرسانی `exceptions.json` | نیاز به بررسی |
| **P2** | C12 | بررسی CI workflow | نیاز به بررسی |
| **P2** | C13 | بررسی `gate-report.ts` | نیاز به بررسی |
| **P2** | C14 | بروزرسانی ROADMAP | ❌ نیاز به آپدیت |
| **P2** | C15 | بروزرسانی WEAKNESSES | ✅ به‌روز |

### بخش B: Wave 2 — Data Protection & Security

| اولویت | مورد | توضیح |
|---|---|---|
| **P0** | B05 | Offline PHI encryption در IndexedDB |
| **P1** | R05 | Firebase credentials rotation evidence |
| **P1** | R07 | Caddy proxy trust limited to CIDR |
| **P2** | R10 | Backup freshness alert (RPO) |
| **P2** | R11 | Logging rotation/retention |

---

## C9 — تست `m1b-runtime-wiring.spec.ts` (P1)

### وضعیت فعلی
تست در محلی PASS می‌شود. نیاز به بررسی اینکه آیا واقعاً درست کار می‌کند.

### مراحل اجرا

```bash
# 1. اجرای تست
npx vitest run apps/web/src/__tests__/m1b-runtime-wiring.spec.ts

# 2. بررسی محتوای تست
cat apps/web/src/__tests__/m1b-runtime-wiring.spec.ts

# 3. اگر تست قبلاً FAIL بود و الان PASS شده، دلیل را بررسی کن
# 4. اگر تست ناقص است، آن را کامل کن
```

### قبولی
- [ ] تست PASS شود
- [ ] تست واقعاً موارد مهم را test کند
- [ ] اگر test ناقص است، test cases اضافه شود

---

## C10 — تست `m5-blockers.spec.ts` (P1)

### وضعیت فعلی
تست در محلی PASS می‌شود. نیاز به بررسی.

### مراحل اجرا

```bash
# 1. اجرای تست
npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts

# 2. بررسی محتوای تست
cat apps/web/src/__tests__/m5-blockers.spec.ts

# 3. بررسی اینکه آیا واقعاً M5 blockers را test می‌کند
```

### قبولی
- [ ] تست PASS شود
- [ ] تست واقعاً M5 blockers را test کند
- [ ] اگر test ناقص است، test cases اضافه شود

---

## C11 — بروزرسانی `exceptions.json` (P2)

### وضعیت فعلی
فایل `tools/conformance/exceptions.json` شامل ۹ استثناء است. نیاز به بررسی اینکه آیا استثنائات جدید (C3, C4) باید اضافه شوند.

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat tools/conformance/exceptions.json

# 2. بررسی اینکه آیا استثنائات C3 (Ruleset) و C4 (Fastify) نیاز داریم
# C3: Ruleset اضافه شد - آیا نیاز به exception دارد؟
# C4: Fastify upgrade شد - آیا نیاز به exception دارد؟

# 3. بررسی استثنائات قدیمی که دیگر معتبر نیستند
# آیا production-mocks exceptions حذف شده؟

# 4. بروزرسانی فایل
```

### قبولی
- [ ] فایل معتبر JSON باشد
- [ ] استثنائات جدید اضافه شده باشند (اگر نیاز است)
- [ ] استثنائات قدیمی حذف شده باشند (اگر معتبر نیستند)
- [ ] `npm run lint` — pass

---

## C12 — بررسی CI Workflow (P2)

### وضعیت فعلی
CI workflow در `.github/workflows/ci.yml` تعریف شده. نیاز به بررسی.

### مراحل اجرا

```bash
# 1. بررسی فایل CI
cat .github/workflows/ci.yml

# 2. بررسی اینکه همه jobs درست تعریف شده باشند

# 3. بررسی اینکه gate report درست کار کند

# 4. بررسی اینکه همه required gates در gate-report.ts تعریف شده باشند
cat tools/ci/gate-report.ts
```

### قبولی
- [ ] CI workflow معتبر باشد
- [ ] Gate report درست کار کند
- [ ] همه required gates تعریف شده باشند (۲۶ gate)

---

## C13 — بررسی `gate-report.ts` (P2)

### وضعیت فعلی
`tools/ci/gate-report.ts` شامل ۲۶ REQUIRED_GATES است.

### مراحل اجرا

```bash
# 1. بررسی فایل
cat tools/ci/gate-report.ts

# 2. بررسی لیست REQUIRED_GATES
# آیا همه gate ها تعریف شده‌اند؟

# 3. بررسی اینکه gate report درست exit کند

# 4. بررسی اینکه DRILL_GATES درست باشد
```

### قبولی
- [ ] `REQUIRED_GATES` لیست کامل باشد (۲۶ gate)
- [ ] Gate report exit 0 when all pass
- [ ] Gate report exit 1 when any fail
- [ ] `DRILL_GATES` درست باشد

---

## C14 — بروزرسانی ROADMAP (P2) ❌ نیاز به آپدیت

### وضعیت فعلی
`docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md` می‌گوید:
- Phase 4: **NOT STARTED** (line 127)
- اما Phase 4 checkbox تیک خورده (line 268)
- **تناقض وجود دارد!**

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md

# 2. بروزرسانی وضعیت Phase 4
# Phase 4 باید "IN PROGRESS" یا "COMPLETE" باشد

# 3. بروزرسانی Phase 5

# 4. رفع تناقض بین checkbox و status line
```

### قبولی
- [ ] Phase 4 وضعیت به‌روز باشد (NOT STARTED → IN PROGRESS یا COMPLETE)
- [ ] Phase 5 وضعیت به‌روز باشد
- [ ] هیچ تناقضی با `PHASE4-CLOSURE-GATE.md` نباشد
- [ ] Checkbox و status line هماهنگ باشند

---

## C15 — بروزرسانی WEAKNESSES (P2)

### وضعیت فعلی
`docs/WEAKNESSES-V2-10-PHASES.md` می‌گوید Phase 4 COMPLETE است.

### مراحل اجرا

```bash
# 1. بررسی فایل فعلی
cat docs/WEAKNESSES-V2-10-PHASES.md

# 2. بررسی اینکه Phase 4 وضعیت درست باشد

# 3. بررسی اینکه معیارهای C1-C7 تکمیل شده باشند
```

### قبولی
- [ ] Phase 4 وضعیت به‌روز باشد
- [ ] موارد تکمیل شده `[x]` باشند
- [ ] هیچ تناقضی با `PHASE4-CLOSURE-GATE.md` نباشد

---

## بخش B: Wave 2 — Data Protection & Security

### B05 — Offline PHI Encryption (P0)

### وضعیت فعلی
`P4-B05`: Offline PHI ممکن است plaintext در IndexedDB ذخیره شود.

### مراحل اجرا

```bash
# 1. بررسی ساختار IndexedDB
# چه داده‌هایی در IndexedDB ذخیره می‌شوند؟

# 2. بررسی encryption envelope
# آیا name/phone ciphertext only هستند؟

# 3. بررسی logout/principal change
# آیا key destroy می‌شود؟

# 4. بررسی PutObject without encryption
# آیا fail می‌کند؟
```

### قبولی
- [ ] IndexedDB inspection بعد از mutation: name/phone ciphertext only
- [ ] Logout/principal change destroys key
- [ ] PutObject without encryption fails

---

### R05 — Firebase Credentials Rotation (P1)

### مراحل اجرا

```bash
# 1. بررسی Firebase credentials
# آیا historical creds deleted شده؟

# 2. بررسی rotation evidence
# آیا rotation انجام شده؟
```

### قبولی
- [ ] Historical creds deleted
- [ ] Rotation evidence موجود باشد

---

### R07 — Caddy Proxy Trust (P1)

### مراحل اجرا

```bash
# 1. بررسی Caddy configuration
# آیا proxy trust limited to CIDR است؟

# 2. بررسی CSP Report-Only
# آیا پیاده‌سازی شده؟
```

### قبولی
- [ ] Caddy proxy trust limited to CIDR
- [ ] CSP Report-Only پیاده‌سازی شده

---

### R10 — Backup Freshness Alert (P2)

### مراحل اجرا

```bash
# 1. بررسی backup cron
# آیا فقط alive check است؟

# 2. بررسی RPO check
# آیا last-run.json با RPO check وجود دارد؟
```

### قبولی
- [ ] Backup freshness alert وجود داشته باشد
- [ ] RPO check پیاده‌سازی شده باشد

---

### R11 — Logging Rotation/Retention (P2)

### مراحل اجرا

```bash
# 1. بررسی logging policy
# آیا rotation/retention تعریف شده؟

# 2. بررسی Caddy validate
# آیا در CI اجرا می‌شود؟
```

### قبولی
- [ ] Logging rotation/retention policy تعریف شده
- [ ] Caddy validate در CI اجرا می‌شود

---

## قوانین کلی

### فرمت کامیت
هر تغییر منطقی = یک کامیت:
```
<type>: <توضیح کوتاه> (C<X> یا <ID>)

- جزئیات ۱
- جزئیات ۲
- تأیید: <دستوری که pass می‌کند>
```

انواع: `fix`, `refactor`, `test`, `docs`, `chore`, `security`

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

## چک‌لیست پایان فاز ۳

### بخش A: معیارهای Wave 1
| معیار | دستور | نتیجه مورد انتظار |
|---|---|---|
| C9 m1b test | `npx vitest run apps/web/src/__tests__/m1b-runtime-wiring.spec.ts` | PASS |
| C10 m5 test | `npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts` | PASS |
| C11 exceptions.json | `node -e "JSON.parse(...)"` | exit 0 |
| C12 CI valid | بررسی دستی | معتبر |
| C13 gate-report | بررسی دستی | ۲۶ gate |
| C14 ROADMAP | بررسی دستی | به‌روز، بدون تناقض |
| C15 WEAKNESSES | بررسی دستی | به‌روز |

### بخش B: Wave 2
| مورد | دستور | نتیجه مورد انتظار |
|---|---|---|
| B05 PHI encryption | بررسی IndexedDB | ciphertext only |
| R05 Firebase | بررسی credentials | rotation evidence |
| R07 Caddy proxy | بررسی config | CIDR limited |
| R10 Backup freshness | بررسی cron | RPO check |
| R11 Logging | بررسی policy | rotation defined |

### تست‌ها
| دستور | نتیجه |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run lint` | pass |
| `npm test` | 741+ pass |

---

## نکات مهم

- **تغییر نده:** `docs/PHASE4-CLOSURE-GATE.md` — مرجع gate است
- **تغییر نده:** `docs/PHASE4-INFRASTRUCTURE-VERIFICATION.md`
- اگر مشکل جدید پیدا کردی، یادداشت کن ولی با معیارهای خودت ادامه بده
- پیام کامیت باید شماره معیار (C9, C10, ...) یا (B05, R05, ...) داشته باشد
- هر کامیت باید با دستورات بالا قابل تأیید باشد

---

**شروع کن با C9 → C10 → C11 → C12 → C13 → C14 → C15 → B05 → R05 → R07 → R10 → R11**
**بعد از هر کامیت push کن و وضعیت را گزارش بده.**

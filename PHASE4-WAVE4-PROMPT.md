# پرامپت ایجنت — فاز ۴ ترمیم Phase 4 (Wave 2: Data Protection & Security)

## مخزن و زمینه

**مخزن:** `https://github.com/parssystem1-coder/scalpai`
**شاخه:** `wave1/phase4-remediation` (PR #69 باز است)
**سند مرجع:** `docs/PHASE4-CLOSURE-GATE.md` — **اول بخوانید**
**پرامپت فاز قبل:** `PHASE4-WAVE3-PROMPT.md`

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

### فاز ۳ — Wave 3 (C9-C15)
| معیار | وضعیت |
|---|---|
| C9 — m1b-runtime-wiring | ✅ تست PASS |
| C10 — m5-blockers | ✅ تست PASS |
| C11 — exceptions.json | ✅ معتبر |
| C12 — CI workflow | ✅ معتبر |
| C13 — gate-report.ts | ⚠️ ۲۵ gate (نه ۲۶) |
| C14 — ROADMAP | ✅ رفع تناقض |
| C15 — WEAKNESSES | ✅ رفع تناقض |

### وضعیت CI
**همه ۹ job PASS هستند** — PR #69 آماده merge.

---

## فاز ۴ — Wave 2: Data Protection & Security

این فاز شامل موارد امنیتی و حفاظت داده است که در `docs/PHASE4-CLOSURE-GATE.md` Section 8 تعریف شده.

---

## B05 — Offline PHI Encryption (P0)

### وضعیت فعلی
- IndexedDB از **Dexie** استفاده می‌کند (`apps/web/src/offline/db.ts`)
- ۴ object store: `outbox`, `deadLetter`, `syncState`, `pendingUploads`
- **رمزگذاری وجود ندارد** — IndexedDB unencrypted است
- **mitigation فعلی:** PHI redaction قبل از ذخیره (`redactPhiPayload()`)
- کد در `sync.ts:31` می‌گوید: "IndexedDB is not a secret store"
- Logout کل DB را پاک می‌کند (`Dexie.delete(name)`)

### آنچه باید انجام شود

#### گزینه ۱: تأیید redaction کافی است (اگر تصمیم بر این باشد)
```bash
# 1. بررسی redaction function
cat apps/web/src/offline/sync.ts | grep -A 20 "redactPhiPayload"

# 2. بررسی اینکه چه داده‌هایی redact می‌شوند
# آیا name/phone ciphertext only هستند؟

# 3. نوشتن test برای تأیید
# Negative test: PutObject without redaction باید fail کند

# 4. مستندسازی تصمیم در ADR
```

#### گزینه ۲: اضافه کردن encryption (اگر نیاز باشد)
```bash
# 1. بررسی کتابخانه‌های موجود برای IndexedDB encryption
# مثلاً: @ahryman408/tsf-encryption یا crypto-js

# 2. پیاده‌سازی encryption envelope
# Key management: از PHI_KEY_RING استفاده کن

# 3. تست اینکه داده‌ها ciphertext only باشند
```

### قبولی
- [ ] مستند شود که چرا redaction کافی است یا encryption پیاده‌سازی شود
- [ ] Negative test: PutObject without redaction fail کند
- [ ] Logout/principal change key را destroy کند
- [ ] ADR برای تصمیم نوشته شود

---

## R05 — Firebase Credentials Rotation (P1)

### وضعیت فعلی
- **Firebase حذف شده** — هیچ فایل `firebase*.json` در مخزن نیست
- `.env` و `.env.example` شامل Firebase variables نیستند
- `ADR-0043` مستند می‌کند که `firebase-applet-config.json` حذف شده
- **نیاز به evidence:** آیا credentials واقعاً rotate/revoked شده‌اند؟

### آنچه باید انجام شود

```bash
# 1. بررسی اینکه آیا Firebase project هنوز وجود دارد
# (نیاز به دسترسی Firebase Console دارد)

# 2. اگر project هنوز exist می‌کند:
#    - Rotate all credentials
#    - Delete project یا至少 revoke all keys

# 3. مستندسازی evidence
#    - Screenshot از Firebase Console
#    - یا API call که نشان دهد credentials revoked شده‌اند

# 4. اضافه کردن به ADR یا exceptions.json
```

### قبولی
- [ ] Evidence موجود باشد که Firebase credentials revoked/rotated شده
- [ ] یا مستند شود که Firebase project وجود ندارد
- [ ] در `exceptions.json` یا ADR ثبت شود

---

## R07 — Caddy Proxy Trust (P1)

### وضعیت فعلی
- Caddy config در `ops/Caddyfile` موجود است
- **مشکل:** proxy trust limited to CIDR نیست
- **مشکل:** CSP Report-Only پیاده‌سازی نشده

### آنچه باید انجام شود

```bash
# 1. بررسی Caddyfile فعلی
cat ops/Caddyfile

# 2. اضافه کردن trusted_proxies با CIDR
# مثال:
# trusted_proxies 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16

# 3. اضافه کردن CSP Report-Only header
# مثال:
# header Content-Security-Policy-Report-Only "default-src 'self'; report-uri /csp-report"

# 4. تست اینکه header درست set می‌شود
```

### قبولی
- [ ] Caddy trusted_proxies با CIDR محدود شده
- [ ] CSP Report-Only header اضافه شده
- [ ] تست شود که header درست set می‌شود
- [ ] در CI test اضافه شود

---

## R10 — Backup Freshness Alert (P2)

### وضعیت فعلی
- `backup.sh` فایل `last-run.json` می‌نویسد
- **مشکل:** RPO staleness check وجود ندارد
- فقط cron alive check هست

### آنچه باید انجام شود

```bash
# 1. بررسی backup.sh فعلی
cat ops/backup.sh

# 2. اضافه کردن RPO check
# مثال:
# RPO_HOURS=24
# LAST_RUN=$(cat $BACKUP_DIR/last-run.json | jq -r '.finishedAt')
# AGE=$(( ($(date +%s) - $(date -d "$LAST_RUN" +%s)) / 3600 ))
# if [ $AGE -gt $RPO_HOURS ]; then notify "backup.stale" critical; fi

# 3. اضافه کردن test برای RPO check
# در backup.phase9.spec.ts

# 4. مستندسازی RPO policy
```

### قبولی
- [ ] RPO check پیاده‌سازی شود
- [ ] Alert اگر backup stale باشد
- [ ] Test اضافه شود
- [ ] مستند شود

---

## R11 — Logging Rotation/Retention (P2)

### وضعیت فعلی
- **پیاده‌سازی نشده** — هیچ log rotation config نیست
- فقط CI artifact retention وجود دارد

### آنچه باید انجام شود

```bash
# 1. تصمیم‌گیری در مورد rotation strategy
# مثال: daily rotation, 30 days retention

# 2. پیاده‌سازی در application
# اگر از pino استفاده می‌شود: pino.transport با rotate

# 3. پیاده‌سازی در Caddy
# access log rotation

# 4. مستندسازی policy
```

### قبولی
- [ ] Log rotation پیاده‌سازی شود
- [ ] Retention policy تعریف شود
- [ ] در CI test اضافه شود
- [ ] مستند شود

---

## C13 — بررسی gate-report.ts (P2)

### وضعیت فعلی
- `tools/ci/gate-report.ts` شامل **۲۵ gate** است
- پرامپت قبلی انتظار ۲۶ gate داشت
- **نیاز به تصمیم:** gate بیست‌وششم چیست؟

### آنچه باید انجام شود

```bash
# 1. بررسی لیست فعلی
cat tools/ci/gate-report.ts | grep -A 30 "REQUIRED_GATES"

# 2. بررسی اینکه آیا gate جدیدی نیاز است
# مثال: backup-freshness, caddy-validate, logging-rotation

# 3. اضافه کردن gate جدید (اگر نیاز باشد)

# 4. بررسی اینکه همه gates در CI تعریف شده باشند
```

### قبولی
- [ ] لیست gates کامل باشد
- [ ] همه gates در CI تعریف شده باشند
- [ ] gate report exit 0 when all pass

---

## قوانین کلی

### فرمت کامیت
هر تغییر منطقی = یک کامیت:
```
<type>: <توضیح کوتاه> (<ID>)

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

## چک‌لیست پایان فاز ۴

| مورد | دستور | نتیجه مورد انتظار |
|---|---|---|
| B05 PHI | بررسی IndexedDB + test | مستند یا encrypted |
| R05 Firebase | بررسی credentials | evidence موجود |
| R07 Caddy | بررسی Caddyfile | CIDR + CSP |
| R10 Backup | بررسی backup.sh | RPO check |
| R11 Logging | بررسی config | rotation defined |
| C13 gate-report | بررسی gates | ۲۵+ gate |
| Type check | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | pass |
| Tests | `npm test` | 741+ pass |

---

## نکات مهم

- **تغییر نده:** `docs/PHASE4-CLOSURE-GATE.md` — مرجع gate است
- **تغییر نده:** `docs/PHASE4-INFRASTRUCTURE-VERIFICATION.md`
- اگر مشکل جدید پیدا کردی، یادداشت کن ولی با معیارهای خودت ادامه بده
- پیام کامیت باید شماره معیار (B05, R05, ...) داشته باشد
- هر کامیت باید با دستورات بالا قابل تأیید باشد

---

**شروع کن با B05 → R05 → R07 → R10 → R11 → C13**
**بعد از هر کامیت push کن و وضعیت را گزارش بده.**

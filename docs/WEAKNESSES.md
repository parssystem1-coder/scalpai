# Weakness Registry — ثبت ضعف‌های شناسایی‌شده

> منبع: تحلیل جامع کد/مستندات 2026-08-25 (دو دور: کلان + عمیق لایه‌به‌لایه).
> قاعده: هر آیتم پس از رفع واقعی (نه ادعا) با مرجع کامیت/PR اینجا ✅ و خط می‌خورد؛ در گیت نهایی فاز ۱، همه آیتم‌های «باید در فاز ۱ بسته شود» باید بسته باشند.
> وضعیت‌ها: ☐ باز · 🔄 در جریان · ✅ بسته · 🕒 موکول‌شده (با تصمیم مالک + فاز مقصد)

## 🔴 بحرانی

- [ ] **W01 — انکودینگ: PROGRESS.md ناخوانا** — متن فارسی به‌صورت mojibake (UTF-8 دوباره‌کُدشده با CP1252) کامیت شده بود؛ ردیاب پیشرفت عملاً غیرقابل استفاده بود.
  - محل: `docs/PROGRESS.md` · اقدام: بازنویسی تمیز UTF-8
- [x] **W02 — انکودینگ: seed داده‌های فارسی garbage** — نام کلینیک/سرویس/بیمار دمو به‌صورت خراب seed می‌شد (`packages/db/src/seed.ts`). — ✅ رفع: Slice H (`3449845`)
- [x] **W03 — انکودینگ: کامنت‌های خراب در سورس کامیت‌شده** — `packages/db/src/repos/core.repo.ts` · `packages/db/src/repos/users.repo.ts` · `apps/api/test/core.integration.spec.ts` — ✅ رفع: Slice H (`3449845`) + ۵ فایل دیگری که قانون جدید لو داد (jwt-access.guard · error.filter · core.controller · migrate · contracts)
- [x] **W04 — انکودینگ: playwright.config.ts (کار T3)** — کامنت‌ها mojibake؛ همان ابزار نوشتن فایل مقصر بود. — ✅ رفع: PR #6 (`0cc2b90`) بازنویسی تمیز

## 🟠 بالا

- [x] **W05 — API بدون CORS** — `apps/api/src/main.ts` هیچ `enableCors` ای ندارد؛ وب روی :5173 نمی‌تواند به :3001 صدا بزند → سناریوی e2e مرورگری بلاک است (تست‌های jsdom این را لو نمی‌دادند). — ✅ رفع: PR #6 (`0cc2b90`) `enableCors({origin:true})`
- [ ] **W06 — ریسک fork زنجیره audit تحت همزمانی** — `appendAudit` آخرین row را می‌خواند و hash می‌سازد؛ دو تراکنش همزمان = prev_hash تکراری → `verifyChain` بعدها fail می‌شود. اقدام: `pg_advisory_xact_lock` قبل از خواندن prev + تست همزمانی. — ✅ رفع: Slice H (`3449845`) + تست همزمانی ۶-درخواستی
- [ ] **W07 — `updated_at` هرگز bump نمی‌شود** — هیچ trigger ای نیست؛ سیاست LWW فاز ۳ (sync) به این ستون تکیه دارد → بمب ساعتی فاز ۳. اقدام: trigger روی patients/sessions در migration جدید. — ✅ رفع: migration 0004 (`3449845`) + تست bump روی soft-delete
- [ ] **W08 — گپ پلی‌بوک 1.4: QuotaGuard موجود نیست** — چک `usage_counters` پیاده نشده.
- [ ] **W09 — گپ پلی‌بوک 1.4: endpoint های admin-plan CRUD نیست** — «ایجاد plan فقط با INSERT» فعلاً فقط در سطح SQL ثابت شده، نه endpoint مدیریتی owner-only.
- [ ] **W10 — گپ پلی‌بوک 1.5: OpenAPI خودکار تولید نمی‌شود.**

## 🟡 متوسط

- [ ] **W11 — `exceptions.json` وجود ندارد** — ADR-21 و گیت چک‌پوینت آن را مرجع می‌دهند و PROGRESS قبلاً «آماده» اعلامش کرده بود؛ عدم تطابق سند/واقعیت.
- [ ] **W12 — CI با `--no-frozen-lockfile` نصب می‌کند** — `.github/workflows/ci.yml:48`؛ lockfile عملاً قفل نیست.
- [x] **W13 — e2e وارد CI نشده + ابهام Exit criteria #1** — تصمیم «@smoke فقط لوکال یا CI» مستند نشده؛ باید در completion فایل T3 حکم شود. — ✅ حکم ثبت شد در `docs/tasks/phase1-T3-playwright-smoke-completion.md`: browser-e2e تا فاز ۲ فقط لوکال (ADR-0024)
- [ ] **W14 — drift نسخه Postgres** — لوکال native PG17 (ADR-0024) ↔ CI/ops روی `pgvector:pg16`.
- [x] **W15 — نبود گارد ماشینی ضد خطای انکودینگ** — ریشه W01..W04 سیستمیک است؛ قانون conformance (presence کاراکترهای CP1252-artifact / U+FFFD) با fixture نقض + self-test اضافه شود تا تکرار نشود. — ✅ رفع: قانون `encoding-guard` در Slice H؛ اولین اجرا ۵ فایل آلوده دیگر را هم گرفت

## 🕒 پایین / بدهی آینده (فاز مقصد مشخص)

- [ ] **W16 — rate-limit لاگین / قفل تدریجی brute-force غایب** (§5/§13) — 🕒 فاز ۲ (قبل از اولین استقرار واقعی)
- [ ] **W17 — helmet/CSP و هدرهای امنیتی غایب** (§13) — 🕒 فاز ۲
- [ ] **W18 — web بدون router** (`main.tsx:11` state ساده authed) — 🕒 فاز ۴ (قبل از دیزاین‌سیستم)
- [ ] **W19 — i18n ناسازگار** — LoginPage از `t()` استفاده می‌کند، PatientsPage رشته hardcode فارسی دارد — 🕒 فاز ۴ (با i18next کامل)
- [ ] **W20 — مرور ایندکس‌های composite** — مثلاً `(clinic_id, start_at)` روی sessions — 🕒 فاز ۲ (همراه media/booking)
- [x] **W21 — معناشناسی دوگانه زنجیره audit** — نوشتن per-clinic زیر RLS ولی `verifyChain` global را می‌گوید که از دید نقش اپ قابل اجرا نیست؛ نیاز به تصمیم+مستندسازی (کامنت/ADR کوچک) — همراه W06 در Slice H — ✅ حکم: زنجیره per-clinic است؛ کامنت رسمی در core.repo.ts (`3449845`)
- [ ] **W22 — ریسک ظرفیت تک‌نفره در برابر وسعت ۸ فاز** — فرآیندی؛ دفاع: قید §15، Tier-B بعد از فاز ۵، کادنس slice — همیشه باز (پایشی)

## نقشه اتصال به اجرا

| Slice | آیتم‌هایی که بسته می‌کند |
|---|---|
| این کامیت (docs) | W01 |
| T3 | W04 · W05 (+ حکم W13) |
| H — db-hardening | W02 · W03 · W06 · W07 · W15 (+ حکم W21) |
| T6 — playbook gaps | W08 · W09 · W10 · W11 |
| فاز ۲+ | W12 · W14 · W16 · W17 · W18 · W19 · W20 |

> W22 هرگز «بسته» نمی‌شود؛ معیار پایش در هر گیت: هیچ کار Tier-B قبل از فاز ۵ شروع نشده باشد.

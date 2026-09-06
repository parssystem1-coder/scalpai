# Engineering Rules — قوانین غیرقابل‌نقض

> این فایل توسط skill «scalpai-build» الزامی می‌شود. نقض هر بند = رد PR.

## 1. Tenant Safety (بحرانی)
- همه جداول business دارای `clinic_id NOT NULL`
- دسترسی داده فقط از طریق Repository layer — هر متد repository اجباراً scope می‌گیرد
- هر تراکنش: `SET LOCAL app.clinic_id = $1` قبل از اولین query
- تست منفی برای هر endpoint: «کاربر tenant دیگر 403/404 بگیرد نه داده»

## 2. حریم داده (PHI)
- ممنوع در لاگ: نام/تلفن/تصویر/نتیجه تحلیل — فقط ID ها
- پیام‌رسانی: متن پیام فقط یادآوری عمومی + لینک توکن‌دار منقضی‌شونده
- آپلود تصویر: EXIF strip + magic-byte check + quality-gate قبل از ذخیره
- صوت Scribe: پردازش لوکال؛ هرگز شبکه/دیسک

## 3. قراردادها
- Schema های zod فقط در `packages/shared` — سرور و کلاینت از همان import کنند
- خطای API: شکل ثابت `{code, message, details?}` — هرگز `{error: string}` آزاد
- تغییر قرارداد = نسخه جدید مسیر یا فیلد اختیاری؛ breaking change ممنوع بدون ADR

## 4. دیتابیس
- ORM: Drizzle فقط — SQL خام فقط داخل migration ها
- Migration: expand→migrate→contract · backward-compatible · rollback قابل نوشتن
- Soft-delete (`deleted_at`) برای جداول business
- Index اجباری: `(clinic_id, ...)` روی هر query پرتکرار
- Unique روی جداول business همیشه partial: `WHERE deleted_at IS NULL`
- جستجوی متنی بیماران فقط pg_trgm از طریق Repository — `LIKE '%..%'` خام ممنوع

## 5. امنیت
- Argon2id رمز کارمند · OTP rate-limit سخت بیمار
- JWT access 15m · Refresh چرخشی با detect استفاده مجدد
- secrets فقط env · هیچ secret در ریپو/لاگ/تست
- CSP strict · sandbox renderer · IPC فقط با validate zod

## 6. کیفیت
- پوشش ≥70% روی packages منطقی (analysis-core, sync-client, licensing)
- هر bugfix = تست بازتولیدکننده اول، بعد fix
- bundle-budget در CI: خروجی وب اولیه <300KB gzip؛ موتور 3D lazy فقط
- pnpm فقط · هر دو lockfile ممنوع · conventional commits

## 7. آفلاین
- هر عملیات نوشتن کلاینت باید مسیر Local DB + Outbox داشته باشد (بدون استثنا)
- sync idempotent با clientMutationId · تعارض per-entity طبق §8 سند (append-only یا field-LWW با version check)
- هر mutation دارای `schemaVersion` — سرور فقط نسخه‌های پشتیبانی‌شده قرارداد را می‌پذیرد
- UI همیشه state اتصال را نشان دهد (badge offline/pending)

## 8. AI Providers
- فراخوانی هر LLM فقط از طریق interface واحد adapter — import مستقیم SDK vendor در سرویس‌ها ممنوع
- قبل از ارسال هر متن به provider ابری: sanitize اجباری PHI (نام/تلفن/شناسه مستقیم) — پیش‌فرض محصول: بدون AI خارجی
- فعال‌سازی provider تصمیم تنظیمی per-clinic است؛ افزودن provider جدید = adapter + contract-test + ADR کوتاه
- خروجی AI همیشه «پیش‌نویس/پیشنهاد» است — تصمیم بالینی با متخصص

## 9. زمان و تقویم
- ذخیره همیشه UTC (`timestamptz`) — هرگز local time
- نمایش در fa فقط با Jalali-util واحد packages/shared — فرمت ad-hoc تاریخ در کامپوننت‌ها ممنوع
- UI فارسی: ارقام فارسی؛ فرم‌ها هر دو ارقام فارسی/لاتین را بپذیرند

## 10. MCP (سرور ابزار AI)
- فقط Tool Registry واحد (packages/shared) — دسترسی مستقیم MCP server به DB ممنوع؛ همه callها از Service/Repository/RLS عبور کنند
- دو هویت اجباری در هر call: هویت agent + on-behalf-of کاربر — هر دو در audit_log؛ request ناقص = رد
- خروجی هر tool فقط طبق field-whitelist همان tool — برگرداندن رکورد کامل ممنوع
- tools خواندنی پیش‌فرض؛ هر write-tool با clientMutationId + تأیید انسانی برای عملیات حساس
- rate-limit دوگانه per-agent/per-user · @RequireFeature('mcp') روی کل سرور
- نسخه پروتکل pin شود (`2026-07-28`) · ترنسپورت فقط Streamable HTTP · ارتقا فقط با ADR
- پیش‌فرض فعال per-clinic؛ غیرفعال‌سازی تصمیم owner است و در audit_log ثبت می‌شود

## 11. CI و گیت Merge
- هیچ خروجی تولیدی CI به main کامیت نمی‌شود — گزارش‌ها فقط artifact
- مسیر Gated (packages/db · apps/api · **apps/web · apps/portal** · sync-client · licensing · notify · shared/MCP Registry) فقط با CI کامل سبز land می‌شود (branch + auto-merge)؛ docs/* مستثناست
- استثناهای مجاز push مستقیم به main: (۱) دستور صریح مالک (hotfix) — دلیل در completion file ثبت شود (۲) دو fail متوالی CI صرفاً زیرساختی برای تغییر بلاک‌کننده — با ثبت در گزارش. غیر از این دو، هیچ
- هر قانون این فایل باید تا جای ممکن معادل ماشینی در tools/conformance داشته باشد (قانون + fixture نقض + self-test)؛ قانون بدون چکر = بدهی مستندشده
- استثنا از هر قانون فقط با ورود در exceptions.json + ارجاع ADR — استثنای بدون ADR = شکست build
- migration-from-empty روی هر push الزامی است — هیچ migration ای از تست عبور نکرده معتبر نیست
- هیچ فاز بدون GATE_REVIEW با حکم PASS از ممیز مستقل (scalpai-gate) تمام‌شده نیست؛ تیک نهایی PROGRESS فقط پس از آن مجاز است
- **قفل فاز:** ورود به فاز N+1 تا PASS گیت فاز N ممنوع — هیچ کار «جلوتر» حتی جزئی شروع نمی‌شود

## 12. کادنس Slice-based و لایه‌بندی تست

- واحد کار = **slice عمودی کامل** (یک قابلیت از قرارداد تا تست)، نه بلاک لایه‌ای
- چرخه اجباری هر slice: pre-change checklist → پیاده‌سازی → mini-DoD (کد+تست+typecheck/lint/test/build/conformance/graph) → push → completion note (`docs/tasks/`) → گزارش و STOP
- Time-box: slice بزرگ‌تر از یک session، قبل از شروع باید بشکند
- **Golden Path:** ساختار مرجع = slice بیماران (core.controller + repos + integration spec)؛ فیچر جدید آن را mirror می‌کند یا mismatch را مستند می‌کند
- Pre-Change Checklist سبک (در توضیح هر slice): ماژول/aggregate صاحب · scope tenant · نقش/فیچر لازم · مرز تراکنش · idempotency (یا «N/A») · ADRهای تأثیرپذیر · لایه تست هر قانون

### جدول لایه‌بندی تست

| قانون زندگی می‌کند در | تست باید باشد در |
|---|---|
| invariant دامنه | unit دامنه |
| orchestration use-case / تراکنش / idempotency | integration اپلیکیشن |
| نقش / entitlement / سهمیه | policy test |
| ایزوله‌سازی tenant / RLS | integration روی PostgreSQL واقعی |
| قرارداد HTTP / کد خطا | contract test |
| مرز معماری | conformance test در CI |

Mock کردن PostgreSQL هرگز الزام ایزوله‌سازی tenant را پوشش نمی‌دهد.
- هیچ فاز بدون GATE_REVIEW با حکم PASS از ممیز مستقل (scalpai-gate) تمام‌شده نیست؛ تیک نهایی PROGRESS فقط پس از آن مجاز است

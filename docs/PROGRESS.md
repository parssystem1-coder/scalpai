# ScalpAI v2 — Progress Tracker

> توسط skill «scalpai-build» نگهداری می‌شود. ✓ = DoD پاس شده
> ضعف‌های شناسایی‌شده در تحلیل 2026-08-25: `docs/WEAKNESSES.md` (W01..W22) — رفع هر کدام آنجا تیک می‌خورد.

## فاز 0 — آماده‌سازی
> 🔒 Gate: PASS — 2026-08-25 — docs/gates/GATE_REVIEW_phase-0-2026-08-25.md
- [x] git init + .gitignore مناسب + اتصال به origin (`parssystem1-coder/scalpai`) — نکته: کد legacy/v1 در این پوشه وجود نداشت؛ آرشیو برنچ N/A
- [x] Monorepo skeleton (pnpm-workspace + turborepo) — 5 app + 9 package + tooling، همه build/typecheck سبز
- [x] tooling مشترک (eslint/tsconfig/tailwind preset) + husky/lint-staged/commitlint فعال
- [x] CI پایه (GitHub Actions): typecheck+lint+test+build+conformance+graph-check — اولین run سبز روی ابر (PR #1)
- [x] Branch protection (required check `base`، strict، admin-bypass برای Fast lane) + auto-merge — پس از عمومی‌شدن ریپو فعال شد
- [x] Scaffold tools/conformance + tools/graph — با self-test و خروجی‌های کامیت‌شده
- [x] ADR-0001..0004 ثبت شده (docs/adr/)
- [x] ADR-0024: توسعه لوکال با PostgreSQL 17 native؛ Docker فقط CI/استقرار

## فاز 1 — ستون فقرات
> 🔒 Gate: PASS — 2026-08-25 — docs/gates/GATE_REVIEW_phase-1-2026-08-25.md
> ترتیب اجرا شده: T3 → H → T6 → T4 → T5 → گیت نهایی ✅

- [x] apps/api: Auth (JWT 15m + refresh چرخشی با کشف استفاده مجدد + Argon2id) + RolesGuard
- [x] Tenancy (SET LOCAL app.clinic_id + NOBYPASSRLS role) + RLS FORCE روی ۱۱ جدول + تست منفی cross-tenant (404)
- [x] AuditLog append-only hash-chain (REVOKE UPDATE/DELETE در سطح SQL) + تست verifyChain
- [x] Plans/Entitlement هسته (§9.1): plans/features/entitlements + @RequireFeature + کش 60s
- [x] CRUD بیمار/جلسه + pagination + soft-delete + قرارداد zod در packages/shared
- [x] fn_auth_login/fn_user_claims (SECURITY DEFINER) برای مسیرهای پیش از احراز هویت
- [x] Conformance Harness v1 (۶ قانون + self-test) — یادداشت: `exceptions.json` هنوز ساخته نشده (W11 → T6)
- [x] Project Graph v0 (modules/deps) + --check در CI
- [x] CI کامل: Postgres واقعی سرویس ابری + migration-from-empty + integration + guardrails — auto-merge فعال (PR #2، #3)
- [x] apps/web شل (login + patients) — Slice T1 (completion: docs/tasks/phase1-T1-web-login-completion.md) · Slice T2 (PR #5 auto-merged، completion: phase1-T2-web-patients-completion.md)
- [x] pnpm e2e @smoke — Slice T3 ✅ (PR #6 auto-merged · completion: docs/tasks/phase1-T3-playwright-smoke-completion.md · شامل رفع W04/W05 و حکم W13)
- [x] Slice H — db-hardening: advisory-lock زنجیره audit + trigger updated_at + پاک‌سازی mojibake سورس (W02/W03/W06/W07/W15/W21 بسته شدند) — completion: docs/tasks/phase1-H-db-hardening-completion.md
- [x] Slice T6 — تکمیل گپ‌های پلی‌بوک: QuotaGuard + admin-plan CRUD + OpenAPI حداقلی + exceptions.json (W08..W11 بسته شدند) — completion: docs/tasks/phase1-T6-playbook-gaps-completion.md
- [x] coverage gate ≥70% — Slice T4 ✅ (lines=81.06% قفل در CI؛ alias سورس در vitest) — completion: docs/tasks/phase1-T4-coverage-completion.md
- [x] Slice T5 — ADR-0025 انحراف Audit-as-Service + ثبت ردیف §17 ✅ (docs/adr/ADR-0025-audit-in-tx-service.md)

> **✅ همه slice های brief + الحاقات اجرا شدند (T1..T6, H) — فاز ۱ «آماده گیت» است.**
> گام بعدی الزامی طبق engineering-rules §11: گیت مستقل پایان فاز («گیت فاز را بگیر» با scalpai-gate) — self-declare ممنوع.

## فاز 2 — رسانه و تحلیل
> 🔒 Gate: PASS — 2026-08-26 — docs/gates/GATE_REVIEW_phase-2-retry-2026-08-26.md (اجرای مجدد پس از رفع blocking آپلود؛ گزارش اول: GATE_REVIEW_phase-2-2026-08-26.md = FAIL)
> ترتیب اجرا شده: M1 → M2 → M3 → M4 → M5 → M6 → fix-upload-progress → گیت نهایی ✅
- [x] Slice M1 — بستر Storage + ADR-0026 + ایندکس‌های W20 ✅ (completion: docs/tasks/phase2-M1-storage-completion.md · W20 بسته شد)
- [x] Media service (presigned URL, chunk upload, thumbnail, EXIF strip) — Slice M3 ✅ (completion: docs/tasks/phase2-M3-upload-pipeline-completion.md)
- [x] Image quality-gate لوکال (blur/light/framing) — Slice M2 ✅ (completion: docs/tasks/phase2-M2-quality-gate-completion.md · fixture «تار رد شود» پاس)
- [x] Slice M4 — گالری کارآمد: cursor API + وب virtualized + seed 500 + budget CI ✅ (completion: docs/tasks/phase2-M4-gallery-completion.md · اثبات پرفورمنس @perf به‌جای Lighthouse — انحراف مستند)
- [x] packages/analysis-engine: heuristic baseline + صفحه نتیجه — Slice M5 ✅ (completion: docs/tasks/phase2-M5-analysis-engine-completion.md · @analysis سبز، موتور کلاینت ۹۲ms <۳s)
- [x] Slice M6 — i18n کامل + Auto-lock + سخت‌سازی W16/W17 ✅ (completion: docs/tasks/phase2-M6-hardening-i18n-completion.md)
- [x] i18next کامل RTL-first + Auto-lock — M6
- [x] rate-limit/helmet منتقله — M6 (W16/W17 بسته شدند)

> **✅ همه slice های brief فاز ۲ اجرا شدند (M1..M6) — فاز ۲ «آماده گیت» است.**
> گام بعدی الزامی: گیت مستقل پایان فاز ۲ («گیت فاز را بگیر» با scalpai-gate).

## فاز 3 — آفلاین و لایسنس
> 🔒 Gate: PASS — 2026-09-04 — docs/gates/GATE_REVIEW_phase-3-2026-09-04.md (تکمیل قطعی + ممیزی مستقل)
> ترتیب: P1 (sync-core خالص) ✓ → P2 (Sync API) ✓ → P3 (وب آفلاین) ✓ → P4 (resume) ✓ → P5 (licensing) ✓ → P6 (self-hosted/بکاپ/anchor) ✓ → P7 (consent+PWA) ✓
- [x] Slice P1 — packages/sync-client هسته خالص + ADR-0027 (PR#17 merged, ۷۲ تست)
- [x] Slice P2 — Sync API: mutations/treatment_plans migrations, POST /sync/push (idempotent), GET /sync/pull (cursor), field-LWW سمت سرور (PR#18 merged, ۷۷ تست)
- [x] Slice P3 — وب آفلاین: Dexie outbox + flush + badge pending + e2e @offline
- [x] Slice P4 — آپلود resume + pending_upload badge (قطعات ۸MB + IndexedDB)
- [x] Slice P5 — Licensing: صدور/verify Ed25519 + Grace + ضدtamper ساعت (۵ تست واحد)
- [x] Slice P6 — ops/: docker-compose self-hosted (prod.yml) + Caddy + بکاپ/بازیابی AES-256 + audit anchor worker
- [x] Slice P7 — Consent دیجیتال (فرم+امضا لمسی/قلم+ذخیره پرونده+تست) + PWA manifest (وب کلینیک)
- [x] بهبودهای تکمیلی مسیر ب (Path B Enhancements):
  - [x] پیش‌نمایش و صدور سند رسمی گواهی رضایت دیجیتال (Consent Certificate Modal + Print/PNG Export)
  - [x] پایشگر سلامت لایسنس Ed25519، سهمیه‌ها و شبیه‌ساز گارد ضدتقلب ساعت سیستم (License Diagnostics)
  - [x] بازرس صف همگام‌سازی محلی Dexie و لاگ شفافیت حل تعارض بر مبنای Field-level LWW (Sync Inspector)
  - [x] ثبت سند رسمی گیت فاز ۳: `docs/gates/GATE_REVIEW_phase-3-2026-09-04.md` ✅

## فاز 4 — تجربه (تکمیل‌شده ✅)
> 🔒 Gate: PASS — 2026-09-22 — docs/gates/GATE_REVIEW_phase-4-2026-09-22.md (Section 10 Closure Gate 13/13)
> پیاده‌سازی کامل استانداردهای DESIGN-V2 §11 و §12 + Wave 1-4 remediation (PR #69, #70) + بستن گیت‌های موج ۴: perf-baseline، a11y-dialog، dashboard-integration، doc-status-consistency (PR #91 + #92)
- [x] Education E1: پکیج `@scalpai/education` با ۸ استوری‌بورد/عارضه بالینی در ۳ سطح شدت + مودال تعاملی سه‌بعدی و استیت‌ماشین عوارض (DESIGN-V2 §11)
- [x] گزارش PDF بالینی: ماژول رسمی تریکوسکوپی با تقویم جلالی، جدول متریک‌های بیومتریک، نسخه چاپی A4 و کد اصالت دیجیتال
- [x] داشبورد Scalp Map + guided capture پرامپت: نقشه هیت‌مپ ۵ ناحیه آناتومیک + گیت ۴ زاویه استاندارد عکاسی درماتوسکوپی و اعتبارسنجی کیفیت تصویر
- [x] پوسته Electron نازک: درایورهای ارتباط با سخت‌افزارهای تریکوسکوپی UVC و لایه کش محلی در `apps/desktop`
- [x] Router وب + i18n کامل PatientsPage (W18/W19)
- [x] گیت‌های enforcement موج ۴: پنج گیت مستقل در REQUIRED_GATES (۳۲ گیت) و ci.yml — no-synthetic-clinical، locale-parity، perf-baseline (hologram ttfr در برابر baseline کامیت‌شده)، a11y-dialog، dashboard-integration — و rule `doc-status-consistency` درون گیت conformance؛ همگی در CI واقعی اجرا و سبز (PR #91 + #92)
- [x] سطر ۱ سند گیت بسته شد: چرخهٔ کامل offline→online به‌عنوان @smoke روی استک واقعی + رفع باگ silent-corruption مسیر outbox (فیلدهای هویتی؛ ADR-0049)
- [x] سطر ۱۱ سند گیت بسته شد: area keys در گالری و lightbox ترجمه شدند (تست رگرسیون دو-زبانه + گیت locale-parity)
- [x] سطر ۵ سند گیت صادق شد: کنترل B05 = redaction نه encryption (ADR-0051)
- [x] سطر ۱۳ سند گیت بسته شد: GATE_REVIEW مستقل `docs/gates/GATE_REVIEW_phase-4-2026-09-22.md` با `verdict: PASS` و URL CI در هر سطر؛ قفل در `tools/quality/phase4-gate-review.spec.ts` (بدون گیت جدید در REQUIRED_GATES)

## فاز 5 — رشد تجاری (Aftercare-first)
> 🔒 Gate: PASS — 2026-09-15 — docs/gates/GATE_REVIEW_phase-5-2026-09-15.md

### Phase 5a ✅ (PR #73 merged)
- [x] Aftercare Engine: sequences + enrollments + delivery worker (packages/db + apps/api)
- [x] Messaging Gateway: 5 stub adapters (Kavenegar/Bale/Eitaa/Telegram/WhatsApp) + channel router (packages/notify)
- [x] Billing: products, invoices, invoice_items, payment with state machines
- [x] Metering: usage_counters + MeteringService
- [x] Phase 5a seed data (1 sequence, 2 products, 1 enrollment, 1 draft invoice)
- [x] Conformance exceptions updated (6 architecture-call-sites)
- [x] 120+ unit tests (aftercare, billing, messaging, metering, scheduler repos)

### Phase 5b ✅ (PR #75 merged)
- [x] Payment Gateway: ZarinpalAdapter injectable via DI token
- [x] Real Kavenegar adapter (replaced stub)
- [x] Webhook HMAC-SHA256 signature guard (WebhookGuard)
- [x] Inbound webhook controller (Kavenegar + Zarinpal callbacks)
- [x] Inbox UI (InboxPage, MessageCard, MessageThread)
- [x] 14 unit tests (payment, inbound, webhook guard)

## فاز 6 — هوش
- [ ] Data Lake بی‌نام‌سازی + expert-review UI + صف Active Learning
- [ ] Grad-CAM overlay در نتایج
- [ ] مدل ۱: فولیکول‌شمار (YOLO) + Eval Gate pipeline + توزیع باندل امضاشده
- [ ] Scalp Explorer 3D (E2) + Evolution Tracker ضایعه
- [ ] جستجوی تصویری اطلس (pgvector embeddings)
- [ ] Spike: طراحی Tool Registry MCP (zod→schema)

## فاز 7 — بلوغ
- [ ] Segmentation + Norwood classifier
- [ ] AI Scribe لوکال native-first (WER-gate فارسی) + Copilot RAG (به‌عنوان MCP Client)
- [ ] ربات پذیرش پیام‌رسان (پوسته نازک MCP) + تشخیص نگرانی پاسخ
- [ ] عضویت/انبار کامل + چندشعبه UI + Open API/webhooks
- [ ] سرور MCP: Tool Registry (zod→schema) + دو هویت + audit + tools فقط-خواندنی v1 (پیش‌فرض فعال)
- [ ] Education E3: دوربین روی ضایعه + روایت صوتی + snapshot در PDF
- [ ] حذف تدریجی AI ابری از تحلیل — provider منتخب فقط تولید متن اختیاری (ADR-18)

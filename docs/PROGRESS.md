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
> ⏳ Gate: شروع شد — brief اجرایی: docs/playbooks/brief-phase2-media-analysis.md (slices M1..M6)
> ترتیب: M1 (storage+ADR-0026+ایندکس‌ها) → M2 (quality-gate) → M3 (آپلود) → M4 (گالری) → M5 (موتور+نتیجه) → M6 (i18n/autolock/سخت‌سازی)
- [x] Slice M1 — بستر Storage + ADR-0026 + ایندکس‌های W20 ✅ (completion: docs/tasks/phase2-M1-storage-completion.md · W20 بسته شد)
- [x] Media service (presigned URL, chunk upload, thumbnail, EXIF strip) — Slice M3 ✅ (completion: docs/tasks/phase2-M3-upload-pipeline-completion.md)
- [x] Image quality-gate لوکال (blur/light/framing) — Slice M2 ✅ (completion: docs/tasks/phase2-M2-quality-gate-completion.md · fixture «تار رد شود» پاس)
- [ ] packages/analysis-engine: heuristic baseline + صفحه نتیجه (<۳ ثانیه) — M5
- [ ] i18next کامل RTL-first + Auto-lock — M6 (+W16/W17 سخت‌سازی منتقله)

## فاز 3 — آفلاین و لایسنس
- [ ] packages/sync-client (Outbox+Cursor+سیاست تعارض per-entity+schemaVersion) + Sync API idempotent
- [ ] آپلود resume + pending_upload badge
- [ ] Licensing: صدور/verify Ed25519 + Grace + ضدtamper ساعت
- [ ] ops/: docker-compose self-hosted + Caddy + بکاپ داخلی
- [ ] audit anchor worker هفتگی
- [ ] Consent دیجیتال (فرم+امضا+ذخیره پرونده)
- [ ] PWA manifest (وب کلینیک)

## فاز 4 — تجربه
- [ ] Education E1: Rive ×۸ storyboard + mapper داده‌محور
- [ ] گزارش PDF بالینی
- [ ] داشبورد Scalp Map + guided capture پرامپت
- [ ] پوسته Electron نازک
- [ ] Router وب + i18n کامل PatientsPage (W18/W19)

## فاز 5 — رشد تجاری (Aftercare-first)
- [ ] Aftercare Engine (توالی JSON) + Messaging Gateway adapter (SMS/Bale/Eitaa ← Telegram ← WhatsApp) + ماتریس کانال‌های ایران
- [ ] یادآور no-show + inbound inbox
- [ ] فاکتور/POS پایه (invoice_items رابطه‌ای) + درگاه ایرانی adapter
- [ ] Metering کامل usage_counters
- [ ] Patient Portal PWA: OTP auth + رزرو آنلاین + فرم پیش‌ازمراجعه (بعد از بازخورد واقعی Aftercare)
- [ ] Before/After نمای بیمار

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

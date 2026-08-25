# ScalpAI v2 — Progress Tracker

> توسط skill «scalpai-build» نگهداری می‌شود. ✓ = DoD پاس شده

## فاز 0 — آماده‌سازی
> 🔒 Gate: PASS — 2026-08-25 — docs/gates/GATE_REVIEW_phase-0-2026-08-25.md
- [x] git init + .gitignore مناسب + اتصال به origin (`parssystem1-coder/scalpai`) — نکته: کد legacy/v1 در این پوشه وجود نداشت؛ آرشیو برنچ N/A
- [x] Monorepo skeleton (pnpm-workspace + turborepo) — 5 app + 9 package + tooling، همه build/typecheck سبز
- [x] tooling مشترک (eslint/tsconfig/tailwind preset) + husky/lint-staged/commitlint فعال
- [x] CI پایه (GitHub Actions): typecheck+lint+test+build+conformance+graph-check — اولین run سبز روی ابر (PR #1)
- [x] Branch protection (required check `base`، strict، admin-bypass برای Fast lane) + auto-merge — پس از عمومی‌شدن ریپو فعال شد
- [x] Scaffold tools/conformance + tools/graph — با self-test (5/5) و خروجی‌های کامیت‌شده
- [x] ADR-0001..0004 ثبت شده (docs/adr/)
- [x] ADR-0024: توسعه لوکال با PostgreSQL 17 native؛ Docker فقط CI/استقرار

## فاز 1 — ستون فقرات
> ⏳ Gate: هنوز گرفته نشده — دو آیتم باقی است (web shell، e2e smoke)
- [x] apps/api: Auth (JWT 15m + refresh چرخشی با کشف استفاده مجدد + Argon2id) + RolesGuard
- [x] Tenancy (SET LOCAL app.clinic_id + NOBYPASSRLS role) + RLS FORCE روی ۱۱ جدول + تست منفی cross-tenant (404)
- [x] AuditLog append-only hash-chain (REVOKE UPDATE/DELETE در سطح SQL) + تست verifyChain
- [x] Plans/Entitlement هسته (§9.1): plans/features/entitlements + @RequireFeature + کش 60s
- [x] CRUD بیمار/جلسه + pagination + soft-delete + قرارداد zod در packages/shared
- [x] fn_auth_login/fn_user_claims (SECURITY DEFINER) برای مسیرهای پیش از احراز هویت
- [x] Conformance Harness v1 (۶ قانون + self-test) + exceptions آماده
- [x] Project Graph v0 (modules/deps) + --check در CI
- [x] CI کامل: Postgres واقعی سرویس ابری + migration-from-empty + integration + guardrails — auto-merge فعال (PR #2، #3)
- [ ] apps/web شل (login + patients) — فاز بعدی همین فاز
- [ ] pnpm e2e @smoke (نیازمند نصب Playwright browsers)
- [ ] coverage gate ≥70% (سنجش و قفل در CI)

## فاز 2 — رسانه و تحلیل
- [ ] Media service (presigned URL, chunk upload, thumbnail, EXIF strip)
- [ ] Image quality-gate لوکال (blur/light/framing)
- [ ] packages/analysis-engine: ONNX loader + heuristic baseline + صفحه نتیجه
- [ ] بودجه تأخیر تحلیل < ۳ ثانیه روی دستگاه مرجع mid-range
- [ ] i18next RTL-first + Auto-lock

## فاز 3 — آفلاین و لایسنس
- [ ] packages/sync-client (Outbox+Cursor+سیاست تعارض per-entity+schemaVersion) + Sync API idempotent
- [ ] آپلود resume + pending_upload badge
- [ ] Licensing: صدور/verify Ed25519 + Grace + ضدtamper ساعت
- [ ] ops/: docker-compose self-hosted + Caddy + backup داخلی
- [ ] audit anchor worker هفتگی
- [ ] Consent دیجیتال (فرم+امضا+ذخیره پرونده)
- [ ] PWA manifest (وب کلینیک)

## فاز 4 — تجربه
- [ ] Education E1: Rive ×۸ storyboard + mapper داده‌محور
- [ ] گزارش PDF بالینی
- [ ] داشبورد Scalp Map + guided capture پرامپت
- [ ] پوسته Electron نازک

## فاز 5 — رشد تجاری (Aftercare-first)
- [ ] Aftercare Engine (توالی JSON) + Messaging Gateway adapter (SMS/Bale/Eitaa ← Telegram ← WhatsApp) + ماتریس کانال‌های ایران
- [ ] یادآور no-show + inbound inbox
- [ ] فاکتور/POS پایه (invoice_items رابطه‌ای) + درگاه ایرانی adapter
- [ ] Metering کامل usage_counters
- [ ] Patient Portal PWA: OTP auth + رزرو آنلاین + فرم پیش‌ازمراجعه (پس از بازخورد واقعی Aftercare)
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

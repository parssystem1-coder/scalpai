# ScalpAI v2 — Progress Tracker

> توسط skill «scalpai-build» نگهداری می‌شود. ✓ = DoD پاس شده

## فاز 0 — آماده‌سازی
- [ ] git init + .gitignore مناسب + آرشیو legacy در branch `legacy/v1`
- [ ] Monorepo skeleton (pnpm-workspace + turborepo)
- [ ] tooling مشترک (eslint/tsconfig/tailwind preset)
- [ ] CI پایه (lint+typecheck+build)
- [ ] Branch protection + auto-merge — دو لاین Fast/Gated (ADR-23)
- [ ] Scaffold tools/conformance + tools/graph
- [ ] ADR-0001..0004 ثبت شده

## فاز 1 — ستون فقرات
- [ ] apps/api: Auth (JWT+Refresh) + RBAC Guards
- [ ] Tenancy Middleware + RLS فعال + تست منفی ایزوله‌سازی
- [ ] AuditLog Interceptor (hash-chain)
- [ ] Plans/Entitlement هسته (§9.1): plans/plan_features/entitlements + @RequireFeature
- [ ] CRUD بیمار/جلسه + packages/db migrations
- [ ] Partial unique indexes + pg_trgm جستجوی فارسی
- [ ] apps/web: شل اپ + دیزاین‌سیستم پایه + فرم‌ها
- [ ] CI کامل: Postgres واقعی + migration-from-empty + conformance + graph --check + bundle-budget + artifact (بدون کامیت گزارش)
- [ ] Conformance Harness v1 (۶ قانون + fixture/self-test + exceptions با ADR)
- [ ] Project Graph (extract مکانیکی + --check در CI)

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

# ScalpAI v2 â€” Progress Tracker

> ØªÙˆØ³Ø· skill Â«scalpai-buildÂ» Ù†Ú¯Ù‡Ø¯Ø§Ø±ÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯. âœ“ = DoD Ù¾Ø§Ø³ Ø´Ø¯Ù‡

## ÙØ§Ø² 0 â€” Ø¢Ù…Ø§Ø¯Ù‡â€ŒØ³Ø§Ø²ÛŒ
> ðŸ”’ Gate: PASS â€” 2026-08-25 â€” docs/gates/GATE_REVIEW_phase-0-2026-08-25.md
- [x] git init + .gitignore Ù…Ù†Ø§Ø³Ø¨ + Ø§ØªØµØ§Ù„ Ø¨Ù‡ origin (`parssystem1-coder/scalpai`) â€” Ù†Ú©ØªÙ‡: Ú©Ø¯ legacy/v1 Ø¯Ø± Ø§ÛŒÙ† Ù¾ÙˆØ´Ù‡ ÙˆØ¬ÙˆØ¯ Ù†Ø¯Ø§Ø´ØªØ› Ø¢Ø±Ø´ÛŒÙˆ Ø¨Ø±Ù†Ú† N/A
- [x] Monorepo skeleton (pnpm-workspace + turborepo) â€” 5 app + 9 package + toolingØŒ Ù‡Ù…Ù‡ build/typecheck Ø³Ø¨Ø²
- [x] tooling Ù…Ø´ØªØ±Ú© (eslint/tsconfig/tailwind preset) + husky/lint-staged/commitlint ÙØ¹Ø§Ù„
- [x] CI Ù¾Ø§ÛŒÙ‡ (GitHub Actions): typecheck+lint+test+build+conformance+graph-check â€” Ø§ÙˆÙ„ÛŒÙ† run Ø³Ø¨Ø² Ø±ÙˆÛŒ Ø§Ø¨Ø± (PR #1)
- [x] Branch protection (required check `base`ØŒ strictØŒ admin-bypass Ø¨Ø±Ø§ÛŒ Fast lane) + auto-merge â€” Ù¾Ø³ Ø§Ø² Ø¹Ù…ÙˆÙ…ÛŒâ€ŒØ´Ø¯Ù† Ø±ÛŒÙ¾Ùˆ ÙØ¹Ø§Ù„ Ø´Ø¯
- [x] Scaffold tools/conformance + tools/graph â€” Ø¨Ø§ self-test (5/5) Ùˆ Ø®Ø±ÙˆØ¬ÛŒâ€ŒÙ‡Ø§ÛŒ Ú©Ø§Ù…ÛŒØªâ€ŒØ´Ø¯Ù‡
- [x] ADR-0001..0004 Ø«Ø¨Øª Ø´Ø¯Ù‡ (docs/adr/)
- [x] ADR-0024: ØªÙˆØ³Ø¹Ù‡ Ù„ÙˆÚ©Ø§Ù„ Ø¨Ø§ PostgreSQL 17 nativeØ› Docker ÙÙ‚Ø· CI/Ø§Ø³ØªÙ‚Ø±Ø§Ø±

## ÙØ§Ø² 1 â€” Ø³ØªÙˆÙ† ÙÙ‚Ø±Ø§Øª
> â³ Gate: Ù‡Ù†ÙˆØ² Ú¯Ø±ÙØªÙ‡ Ù†Ø´Ø¯Ù‡ â€” Ø¯Ùˆ Ø¢ÛŒØªÙ… Ø¨Ø§Ù‚ÛŒ Ø§Ø³Øª (web shellØŒ e2e smoke)
- [x] apps/api: Auth (JWT 15m + refresh Ú†Ø±Ø®Ø´ÛŒ Ø¨Ø§ Ú©Ø´Ù Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù…Ø¬Ø¯Ø¯ + Argon2id) + RolesGuard
- [x] Tenancy (SET LOCAL app.clinic_id + NOBYPASSRLS role) + RLS FORCE Ø±ÙˆÛŒ Û±Û± Ø¬Ø¯ÙˆÙ„ + ØªØ³Øª Ù…Ù†ÙÛŒ cross-tenant (404)
- [x] AuditLog append-only hash-chain (REVOKE UPDATE/DELETE Ø¯Ø± Ø³Ø·Ø­ SQL) + ØªØ³Øª verifyChain
- [x] Plans/Entitlement Ù‡Ø³ØªÙ‡ (Â§9.1): plans/features/entitlements + @RequireFeature + Ú©Ø´ 60s
- [x] CRUD Ø¨ÛŒÙ…Ø§Ø±/Ø¬Ù„Ø³Ù‡ + pagination + soft-delete + Ù‚Ø±Ø§Ø±Ø¯Ø§Ø¯ zod Ø¯Ø± packages/shared
- [x] fn_auth_login/fn_user_claims (SECURITY DEFINER) Ø¨Ø±Ø§ÛŒ Ù…Ø³ÛŒØ±Ù‡Ø§ÛŒ Ù¾ÛŒØ´ Ø§Ø² Ø§Ø­Ø±Ø§Ø² Ù‡ÙˆÛŒØª
- [x] Conformance Harness v1 (Û¶ Ù‚Ø§Ù†ÙˆÙ† + self-test) + exceptions Ø¢Ù…Ø§Ø¯Ù‡
- [x] Project Graph v0 (modules/deps) + --check Ø¯Ø± CI
- [x] CI Ú©Ø§Ù…Ù„: Postgres ÙˆØ§Ù‚Ø¹ÛŒ Ø³Ø±ÙˆÛŒØ³ Ø§Ø¨Ø±ÛŒ + migration-from-empty + integration + guardrails â€” auto-merge ÙØ¹Ø§Ù„ (PR #2ØŒ #3)
- [ ] apps/web Ø´Ù„ (login + patients) â€” ÙØ§Ø² Ø¨Ø¹Ø¯ÛŒ Ù‡Ù…ÛŒÙ† ÙØ§Ø²
- [ ] pnpm e2e @smoke (Ù†ÛŒØ§Ø²Ù…Ù†Ø¯ Ù†ØµØ¨ Playwright browsers)
- [ ] coverage gate â‰¥70% (Ø³Ù†Ø¬Ø´ Ùˆ Ù‚ÙÙ„ Ø¯Ø± CI)

> **Ú©Ø§Ø¯Ù†Ø³ Ø¬Ø¯ÛŒØ¯ (Â§12 Ù‚ÙˆØ§Ù†ÛŒÙ†):** Ø¨Ø§Ù‚ÛŒâ€ŒÙ…Ø§Ù†Ø¯Ù‡ Ø¨Ù‡â€ŒØµÙˆØ±Øª Ûµ slice Ø¯Ø± `brief-phase1-completion.md` Ø§Ø¬Ø±Ø§ Ù…ÛŒâ€ŒØ´ÙˆØ¯ â€” Ø¨Ø¹Ø¯ Ø§Ø² Ù‡Ø± slice: STOP & REPORT. T5 Ø´Ø§Ù…Ù„ ADR-0025 Ø§Ù†Ø­Ø±Ø§Ù Audit-as-Service Ø§Ø³Øª.

## ÙØ§Ø² 2 â€” Ø±Ø³Ø§Ù†Ù‡ Ùˆ ØªØ­Ù„ÛŒÙ„
- [ ] Media service (presigned URL, chunk upload, thumbnail, EXIF strip)
- [ ] Image quality-gate Ù„ÙˆÚ©Ø§Ù„ (blur/light/framing)
- [ ] packages/analysis-engine: ONNX loader + heuristic baseline + ØµÙØ­Ù‡ Ù†ØªÛŒØ¬Ù‡
- [ ] Ø¨ÙˆØ¯Ø¬Ù‡ ØªØ£Ø®ÛŒØ± ØªØ­Ù„ÛŒÙ„ < Û³ Ø«Ø§Ù†ÛŒÙ‡ Ø±ÙˆÛŒ Ø¯Ø³ØªÚ¯Ø§Ù‡ Ù…Ø±Ø¬Ø¹ mid-range
- [ ] i18next RTL-first + Auto-lock

## ÙØ§Ø² 3 â€” Ø¢ÙÙ„Ø§ÛŒÙ† Ùˆ Ù„Ø§ÛŒØ³Ù†Ø³
- [ ] packages/sync-client (Outbox+Cursor+Ø³ÛŒØ§Ø³Øª ØªØ¹Ø§Ø±Ø¶ per-entity+schemaVersion) + Sync API idempotent
- [ ] Ø¢Ù¾Ù„ÙˆØ¯ resume + pending_upload badge
- [ ] Licensing: ØµØ¯ÙˆØ±/verify Ed25519 + Grace + Ø¶Ø¯tamper Ø³Ø§Ø¹Øª
- [ ] ops/: docker-compose self-hosted + Caddy + backup Ø¯Ø§Ø®Ù„ÛŒ
- [ ] audit anchor worker Ù‡ÙØªÚ¯ÛŒ
- [ ] Consent Ø¯ÛŒØ¬ÛŒØªØ§Ù„ (ÙØ±Ù…+Ø§Ù…Ø¶Ø§+Ø°Ø®ÛŒØ±Ù‡ Ù¾Ø±ÙˆÙ†Ø¯Ù‡)
- [ ] PWA manifest (ÙˆØ¨ Ú©Ù„ÛŒÙ†ÛŒÚ©)

## ÙØ§Ø² 4 â€” ØªØ¬Ø±Ø¨Ù‡
- [ ] Education E1: Rive Ã—Û¸ storyboard + mapper Ø¯Ø§Ø¯Ù‡â€ŒÙ…Ø­ÙˆØ±
- [ ] Ú¯Ø²Ø§Ø±Ø´ PDF Ø¨Ø§Ù„ÛŒÙ†ÛŒ
- [ ] Ø¯Ø§Ø´Ø¨ÙˆØ±Ø¯ Scalp Map + guided capture Ù¾Ø±Ø§Ù…Ù¾Øª
- [ ] Ù¾ÙˆØ³ØªÙ‡ Electron Ù†Ø§Ø²Ú©

## ÙØ§Ø² 5 â€” Ø±Ø´Ø¯ ØªØ¬Ø§Ø±ÛŒ (Aftercare-first)
- [ ] Aftercare Engine (ØªÙˆØ§Ù„ÛŒ JSON) + Messaging Gateway adapter (SMS/Bale/Eitaa â† Telegram â† WhatsApp) + Ù…Ø§ØªØ±ÛŒØ³ Ú©Ø§Ù†Ø§Ù„â€ŒÙ‡Ø§ÛŒ Ø§ÛŒØ±Ø§Ù†
- [ ] ÛŒØ§Ø¯Ø¢ÙˆØ± no-show + inbound inbox
- [ ] ÙØ§Ú©ØªÙˆØ±/POS Ù¾Ø§ÛŒÙ‡ (invoice_items Ø±Ø§Ø¨Ø·Ù‡â€ŒØ§ÛŒ) + Ø¯Ø±Ú¯Ø§Ù‡ Ø§ÛŒØ±Ø§Ù†ÛŒ adapter
- [ ] Metering Ú©Ø§Ù…Ù„ usage_counters
- [ ] Patient Portal PWA: OTP auth + Ø±Ø²Ø±Ùˆ Ø¢Ù†Ù„Ø§ÛŒÙ† + ÙØ±Ù… Ù¾ÛŒØ´â€ŒØ§Ø²Ù…Ø±Ø§Ø¬Ø¹Ù‡ (Ù¾Ø³ Ø§Ø² Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ ÙˆØ§Ù‚Ø¹ÛŒ Aftercare)
- [ ] Before/After Ù†Ù…Ø§ÛŒ Ø¨ÛŒÙ…Ø§Ø±

## ÙØ§Ø² 6 â€” Ù‡ÙˆØ´
- [ ] Data Lake Ø¨ÛŒâ€ŒÙ†Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ + expert-review UI + ØµÙ Active Learning
- [ ] Grad-CAM overlay Ø¯Ø± Ù†ØªØ§ÛŒØ¬
- [ ] Ù…Ø¯Ù„ Û±: ÙÙˆÙ„ÛŒÚ©ÙˆÙ„â€ŒØ´Ù…Ø§Ø± (YOLO) + Eval Gate pipeline + ØªÙˆØ²ÛŒØ¹ Ø¨Ø§Ù†Ø¯Ù„ Ø§Ù…Ø¶Ø§Ø´Ø¯Ù‡
- [ ] Scalp Explorer 3D (E2) + Evolution Tracker Ø¶Ø§ÛŒØ¹Ù‡
- [ ] Ø¬Ø³ØªØ¬ÙˆÛŒ ØªØµÙˆÛŒØ±ÛŒ Ø§Ø·Ù„Ø³ (pgvector embeddings)
- [ ] Spike: Ø·Ø±Ø§Ø­ÛŒ Tool Registry MCP (zodâ†’schema)

## ÙØ§Ø² 7 â€” Ø¨Ù„ÙˆØº
- [ ] Segmentation + Norwood classifier
- [ ] AI Scribe Ù„ÙˆÚ©Ø§Ù„ native-first (WER-gate ÙØ§Ø±Ø³ÛŒ) + Copilot RAG (Ø¨Ù‡â€ŒØ¹Ù†ÙˆØ§Ù† MCP Client)
- [ ] Ø±Ø¨Ø§Øª Ù¾Ø°ÛŒØ±Ø´ Ù¾ÛŒØ§Ù…â€ŒØ±Ø³Ø§Ù† (Ù¾ÙˆØ³ØªÙ‡ Ù†Ø§Ø²Ú© MCP) + ØªØ´Ø®ÛŒØµ Ù†Ú¯Ø±Ø§Ù†ÛŒ Ù¾Ø§Ø³Ø®
- [ ] Ø¹Ø¶ÙˆÛŒØª/Ø§Ù†Ø¨Ø§Ø± Ú©Ø§Ù…Ù„ + Ú†Ù†Ø¯Ø´Ø¹Ø¨Ù‡ UI + Open API/webhooks
- [ ] Ø³Ø±ÙˆØ± MCP: Tool Registry (zodâ†’schema) + Ø¯Ùˆ Ù‡ÙˆÛŒØª + audit + tools ÙÙ‚Ø·-Ø®ÙˆØ§Ù†Ø¯Ù†ÛŒ v1 (Ù¾ÛŒØ´â€ŒÙØ±Ø¶ ÙØ¹Ø§Ù„)
- [ ] Education E3: Ø¯ÙˆØ±Ø¨ÛŒÙ† Ø±ÙˆÛŒ Ø¶Ø§ÛŒØ¹Ù‡ + Ø±ÙˆØ§ÛŒØª ØµÙˆØªÛŒ + snapshot Ø¯Ø± PDF
- [ ] Ø­Ø°Ù ØªØ¯Ø±ÛŒØ¬ÛŒ AI Ø§Ø¨Ø±ÛŒ Ø§Ø² ØªØ­Ù„ÛŒÙ„ â€” provider Ù…Ù†ØªØ®Ø¨ ÙÙ‚Ø· ØªÙˆÙ„ÛŒØ¯ Ù…ØªÙ† Ø§Ø®ØªÛŒØ§Ø±ÛŒ (ADR-18)

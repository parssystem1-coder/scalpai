# Phase 1 · Slice T3 — Playwright @smoke · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase1-t3-playwright` → PR (Gated lane — شامل apps/api و packages/db)
- **State:** T3 complete. H/T6/T4/T5 not started.

## انجام‌شده
- Playwright setup ریشه‌ای (`playwright.config.ts`) با دو webServer واقعی:
  - API: build کامل db/shared/api → `node dist/main.js` روی :3001 (health probe)
  - Web: `vite --port 5173 --strictPort --host 127.0.0.1`
- `e2e/smoke.spec.ts`: مسیر طلایی مرورگری — login (owner@clinic-a.test) → ایجاد بیمار → دیده‌شدن در لیست
- اسکریپت `pnpm e2e` = migrate + seed + playwright test
- endpoint عمومی `GET /api/v1/health` برای probe

## باگ‌هایی که در راه سبزشدن smoke لو رفت و رفع شد
| # | یافته | رفع | ردیابی |
|---|---|---|---|
| 1 | API هیچ CORS ای نداشت — مرورگر پاسخ :3001 را بلاک می‌کرد | `enableCors({origin:true})` در `main.ts` | W05 ✅ |
| 2 | `loadEnv` فقط cwd را می‌خواند؛ اجرای `--filter exec` از `apps/api` باعث حذف `DATABASE_URL` و خطای `role "user" does not exist` می‌شد | walk-up تا پیدا شدن `.env` ریشه | — |
| 3 | vite به‌طور پیش‌فرض روی localhost/IPv6 bind می‌شود ولی Playwright روی 127.0.0.1 poll می‌کند → timeout 60s | `--host 127.0.0.1` صریح | — |
| 4 | تلفن تولیدی تست ۱۲ رقمی بود؛ قرارداد `^0\d{10}$` آن را درست رد می‌کرد | تولید ۱۱ رقمی در spec | — |
| 5 | کامنت‌های mojibake در playwright.config.ts | بازنویسی تمیز | W04 ✅ |

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm e2e` (@smoke روی استک واقعی لوکال) | **1 passed** — login→create→listed |
| typecheck / lint / build | 16/16 · exit0 · 14/14 |
| tests (unit+integration روی PG17 native) | **16 passed / 16** |
| conformance | PASS (6 rules) |
| graph --check | سبز |

## حکم e2e در CI (حکم W13)
@smoke طبق ADR-0024 فقط لوکال اجرا شد و همین اجرا سند است. ورود browser-e2e به CI (نصب browsers روی runner) تصمیم فاز ۲ است — Exit criteria #1 از مسیر «اجرای محلی + این completion file» اثبات می‌شود.

## یادداشت صادقانه فرآیندی
- mini-DoD ابتدا fail شد (۴ مورد جدول بالا هر کدام یک دور دیباگ واقعی) — بدون دست‌زنی به تست برای سبز شدن؛ قرارداد phone همان‌قدر سختگیرانه ماند.
- تغییرات `package.json` سه پکیج (main/types → dist و dev/start از build) پیش از این session روی برنچ بود؛ بازبینی و تأیید شد چون parity اجرای production را برای webServer لازم دارد.

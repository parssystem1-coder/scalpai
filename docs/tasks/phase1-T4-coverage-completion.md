# Phase 1 · Slice T4 — coverage gate ≥70% · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase1-t4-coverage-gate` → PR (Gated lane — CI workflow + root test config)
- **مجوز:** brief-phase1-completion.md Slice T4

## انجام‌شده
- `@vitest/coverage-v8` به ریشه اضافه شد؛ اسکریپت `pnpm test:coverage`
- پیکربندی coverage در vitest.config.ts: include فقط چهار پکیج منطقی (`db`، `sync-client`، `licensing`، `analysis-core`)؛ threshold ‏`lines ≥ 70`
- **CI:** استپ تست حالا `pnpm test:coverage` را اجرا می‌کند (همان suite + سنجش + قفل آستانه در یک پاس)
- **بهبود جانبی مهم:** alias در vitest — تست‌ها حالا `@scalpai/db` و `@scalpai/shared` را از **src** مصرف می‌کنند نه dist. دو پیامد:
  1. کاورج واقعاً روی خطوط سورس محاسبه می‌شود (بدون alias: 0% چون runtime فقط dist را می‌دید)
  2. footgun ثبت‌شده در Slice H حذف شد — دیگر فراموش‌کردن rebuild قبل از تست، نتیجه کهنه نمی‌دهد

## عدد واقعی
| سنجه | مقدار |
|---|---|
| Lines | **81.06%** (آستانه: 70%) |
| Statements / Branch / Funcs | 78.21% / 64.58% / 78.94% |
| تست‌ها هنگام سنجش | 26 passed |

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test:coverage` | 26/26 + lines 81.06% ≥ 70 ✅ |
| typecheck / lint / build | 16/16 · exit0 · 14/14 |
| conformance / graph --check | PASS · سبز |

## یادداشت صادقانه فرآیندی
- سه پکیج sync-client/licensing/analysis-core فعلاً استاب تک‌خطی‌اند؛ وقتی فاز ۳/۶ کد واقعی بگیرند، همین gate خودشان را هم می‌پوشاند (include از الان تنظیم است).
- branch coverage فعلاً آستانه ندارد (فقط طبق brief: lines≥70)؛ بالا بردنش تصمیم فاز ۲ است.

# Phase 2 · Slice M2 — Quality Gate لوکال در analysis-core · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase2-m2-quality-gate` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M2 · پلی‌بوک ۲ بند 2.2

## انجام‌شده
| آیتم | شرح |
|---|---|
| `gray.ts` | تبدیل RGBA→grayscale (luma ‏Rec.709) روی Float32Array — ارز مشترک تحلیل بین Node و WASM آینده |
| `quality.ts` | `measureQuality`: واریانس Laplacian ‏(۴-همسایه) برای تاری، میانگین لومای هیستوگرام برای نور، نسبت پیکسل‌های گرادیان‌دار برای کادر؛ `computeQuality` → verdict با دلایل فارسی کاربر-رو |
| thresholds | صریح و export‌شده: blurVariance≥35 · brightness∈[40,218] · edgeRatio≥0.02 · minDimension=16 |
| fixtures synthetic | تولید قطعی صحنه نویزی با seed ثابت + sharp (blur(6)، modulate تاری، linear بیش‌نور، فریم flat خاکستری) — بدون نیاز به عکس واقعی |

## اثبات DoD پلی‌بوک («تصویر تار عمدی رد شود»)
تست `rejects an intentionally blurred frame`: ‏blurVariance زیر آستانه + reason شامل «تار» ✅

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | **33 passed / 33** (+۷ کیفیت: pass/تار/تاریک/شسته/خالی/قطعیت/ریزکادر) |
| coverage | lines=**84.26%** ≥70 (کد جدید analysis-core زیر پوشش آمد) |
| typecheck / lint / build / conformance / graph | سبز تمام |

## یادداشت صادقانه فرآیندی
- دو دور fail→fix: (۱) tsconfig پکیج spec را هم کامپایل می‌کرد → exclude الگودار؛ (۲) نوع verdict با آرایه خالی literal در TS سخت‌گیر بود → شکل واحد ساده‌تر.
- آستانه‌ها روی fixture های synthetic کالیبره شده‌اند؛ پس از اولین عکس‌های واقعی pilot ممکن است نیاز به تنظیم داشته باشند — عدد در `QUALITY_THRESHOLDS` مرکزی است، نه پراکنده.

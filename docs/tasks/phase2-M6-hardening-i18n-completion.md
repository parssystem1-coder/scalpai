# Phase 2 · Slice M6 — i18n کامل + Auto-lock + سخت‌سازی (W16/W17) · Completion

- **Date:** 2026-08-26
- **Branch/PR:** `feat/phase2-m6-hardening-i18n` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M6 · پلی‌بوک ۲ بند 2.5

## انجام‌شده

| آیتم | شرح | ردیابی |
|---|---|---|
| i18next کامل | همه رشته‌های hardcode سه صفحه → resources ‏fa/en؛ مقادیر fa عین رشته‌های قبلی‌اند تا سناریوهای e2e فارسی دست‌نخورده بمانند | بند 2.5 |
| سوییچ زبان | دکمه EN/فا در سربرگ صفحات + persist در localStorage | بند 2.5 |
| ارقام فارسی | `faNum()` برای زمان تحلیل/نمرات/شدت فقط در لایه نمایش؛ داده همچنان ASCII | قوانین §9 |
| Auto-lock | `AutoLock` با ۵ رویداد activity، تایمر ۱۰ دقیقه، re-arm پس از فiring؛ در هر سه صفحه محافظت‌شده | بند 2.5 |
| W16 | `LoginThrottleService`: قفل تدریجی per-email (۵ خطا → ۶۰s با دوبرابر شدن تا سقف ۱۵د) + پنجره sliding ‏per-IP ‏(20/min) → 429 با کدهای LOGIN_LOCKED / TOO_MANY_REQUESTS؛ env override برای تست قطعی؛ نسخه Redis در فاز ۵ | W16 ✅ |
| W17 | `registerSecurityHeaders` (helmet): HSTS + X-Frame-Options + nosniff روی همه پاسخ‌های API؛ CSP سند HTML به وب اپ (فاز ۴) واگذار شد — تصمیم مستند | W17 ✅ |

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | **62 passed / 62** (+۳ throttle/headers، +۳ autolock) |
| typecheck / lint / build / conformance / graph / budget(144KB) | سبز تمام |
| e2e smoke + @analysis | هر دو پاس — UI ترجمه‌شده selectors را نشکست (مقادیر fa عیناً حفظ شد) |

## نکته e2e
assert elapsed حالا ارقام فارسی را نرمال می‌کند (`[۰-۹]→0-9`) — خروجی واقعی این slice همین را اجباری کرد.

## یادداشت صادقانه فرآیندی (W23 مصداق یافت)
برنچ M6 اشتباهی از قبلِ M5 ساخته شده بود و وسط کار لو رفت؛ با wip-commit + merge از origin/main بازیابی شد. قانون جدید: **قبل از ساخت برنچِ هر slice جدید: checkout main + pull** — به‌عنوان W23 در registry ثبت می‌شود.

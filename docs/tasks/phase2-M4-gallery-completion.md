# Phase 2 · Slice M4 — گالری کارآمد (API + وب) · Completion

- **Date:** 2026-08-25
- **Branch/PR:** `feat/phase2-m4-gallery` → PR (Gated lane)
- **مرجع:** brief-phase2-media-analysis.md Slice M4 · پلی‌بوک ۲ بند 2.4

## انجام‌شده
| آیتم | شرح |
|---|---|
| API | `GET /patients/:pid/gallery` با keyset-cursor روی (created_at,id) — هم‌راستا با ایندکس 0005؛ پاسخ شامل presigned view/thumb URL های کوتاه‌عمر؛ `DELETE /gallery/:gid` نرم + audit |
| migration 0006 | `gallery_items.deleted_at` — ستون soft-delete جاافتاده‌ی §4 (analyses طبق سیاست append-only استثناست)؛ تاریخچه 0005 دست‌نخورده ماند |
| وب | Router واقعی (react-router-dom): `/login · /patients · /patients/:pid/gallery`؛ صفحه گالری با TanStack Query بی‌نهایت + TanStack Virtual (۴ ستونه، overscan)؛ آپلود سه‌مرحله‌ای در UI با نمایش خطای canonical؛ حذف per-item |
| ضد base64 | رندر فقط با thumbUrl امضاشده — تست render صریحاً src را علیه `^data:` چک می‌کند |
| seed پرفورمنس | `pnpm db:seed:gallery [count]` — top-up دقیق تا N، آبجکت‌های واقعی jpeg در MinIO؛ اجرا شد: **۵۰۰ رکورد** |
| بودجه bundle | step جدید CI + `pnpm budget:bundle` → **141KB gzip** از سقف 300KB ✓ |

## اثبات پرفورمنس (انحراف مستندشده از «Lighthouse»)
Lighthouse نمی‌تواند به SPA ی با token در حافظه احراز هویت کند و audit صفحه login بی‌معناست. معادل عملیاتیِ قابل‌اجرا جایگزین شد:
- harness ‏`?mock=500` فقط-DEV (با `import.meta.env.DEV` از باندل production حذف می‌شود؛ bypass احراز نیز فقط DEV)
- تست مرورگری `e2e/perf.gallery.spec.ts` با تگ **@perf**: اولین تصویر **۳۲۸ms** (<۳s) · تعداد tileهای mount شده هنگام اسکرول عمق ۱۰۰۰px+ برابر ≤۶۰ (نه ۵۰۰) — اثبات رفتاری virtualization
- معیار عینی CI همان bundle-budget است که سبز است.
گیت می‌تواند این انحراف را قضاوت کند؛ بازگشت به LH واقعی نیازمند مسیر توکن URL است که PHI-safe نیست و توصیه نمی‌شود.

## mini-DoD
| گام | نتیجه |
|---|---|
| `pnpm test` | **46 passed / 46** (+۳ لیست/حذف/cross-tenant گالری، +۲ render وب) |
| typecheck / lint / build / conformance / graph / budget | همه سبز — conformance یک بار `pg` خارج از db را در اسکریپت گرفت و اسکریپت به packages/db منتقل شد |
| `pnpm db:seed:gallery 500` | total=500 دقیق |
| `playwright e2e/perf` | passed (۳۲۸ms) |

## یادداشت صادقانه فرآیندی
- دو fail آموزنده: (۱) ویرایش migration اعمال‌شده (0005) را نصفه رها کردم و به‌جایش 0006 ساختم — تاریخچه immutable ماند؛ (۲) `<img alt="">` نقش ARIA ندارد و findByRole آن را نمی‌بیند — سلکتور مستقیم.
- vi.mock ماژول client در این spec عمل نکرد؛ به stub سراسری fetch سوئیچ شد که قطعی‌تر است.

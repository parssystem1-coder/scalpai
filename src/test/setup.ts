/**
 * setup.ts — آماده‌سازی مشترک محیط تست (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * این فایل برای **همهٔ** تست‌ها اجرا می‌شود، ولی تست‌های منطق خالص در محیط
 * `node` اجرا می‌شوند و DOM ندارند. پس هر کاری که به DOM نیاز دارد باید پشت
 * یک بررسی شرطی باشد، وگرنه ۲۷۳ تست موجود می‌شکنند.
 */

// matcherهای jest-dom (مثل toBeInTheDocument) فقط وقتی DOM هست معنا دارند
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');

  // پاک‌سازی درخت DOM بین تست‌ها تا نشت حالت بین آن‌ها رخ ندهد
  afterEach(() => cleanup());

  /**
   * jsdom این دو را پیاده نکرده ولی کد اپ (Radix/Tailwind/انیمیشن‌ها) صدایشان
   * می‌زند. بدون این‌ها تست‌ها با خطای بی‌ربط می‌شکنند و وقت تیم را می‌گیرند.
   */
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

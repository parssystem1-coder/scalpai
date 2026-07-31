import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDHash, findDhashDuplicate, DHASH_TWIN_THRESHOLD } from '../../lib/imageDedup';

/**
 * تست دود — سد ضدتکرار آپلود گالری (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * چرا این جریان مهم است: در `useGalleryPage.tsx:423-443`، هنگام آپلود عکس یک
 * هش ادراکی ساخته می‌شود و اگر «دوقلوی بصری» پیدا شود از کاربر تأیید گرفته
 * می‌شود. اگر این سد بشکند، عکس‌های تکراری وارد استخر آموزشی می‌شوند و
 * کیفیت دیتاست بی‌سروصدا خراب می‌شود.
 *
 * **صداقت دربارهٔ دامنهٔ این تست:** رندر کردن کل صفحهٔ گالری در jsdom عملی
 * نیست (به canvas واقعی، ویدیو و ده‌ها وابستگی نیاز دارد). به‌جای نوشتن یک
 * تست ظاهری و بی‌ارزش، این‌جا **رفتار واقعی سد** در محیط DOM سنجیده می‌شود:
 * ① `computeDHash` در محیط مرورگر بدون کرش کار می‌کند ② تصمیم «دوقلو هست یا
 * نه» درست گرفته می‌شود ③ الگوی نامعتبر باعث مثبت کاذب نمی‌شود.
 * پوشش کامل UI گالری در دامنهٔ تست دود نیست و این‌جا ادعایش را نمی‌کنیم.
 */

/** یک PNG ۱ پیکسلی معتبر */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('تست دود / AUD-13 — سد ضدتکرار گالری', () => {
  /**
   * گارد AUD-17 — این تست یک نقص واقعی را کشف کرد و حالا از بازگشتش
   * جلوگیری می‌کند.
   *
   * نقص: `computeDHash` فقط با `onload`/`onerror` تمام می‌شد. اگر مرورگر
   * هیچ‌کدام را شلیک نکند (فایل خراب یا فرمت پشتیبانی‌نشده)، Promise **برای
   * همیشه معلق** می‌ماند. مصرف‌کننده در `useGalleryPage.tsx:423` داخل حلقهٔ
   * آپلود روی آن `await` می‌کند، پس کل آپلود قفل می‌شد و کاربر تا ابد
   * چرخندهٔ «در حال آپلود» می‌دید — بدون هیچ پیام خطایی.
   *
   * jsdom دقیقاً همین شرایط را بازتولید می‌کند (رویداد بارگذاری تصویر را
   * شلیک نمی‌کند)، پس این تست همان سناریوی واقعی را می‌سنجد.
   */
  it('گارد AUD-17: وقتی رویداد بارگذاری تصویر نمی‌آید، Promise معلق نمی‌ماند', async () => {
    expect(typeof document).toBe('object');
    const started = Date.now();
    const hash = await computeDHash(TINY_PNG);
    const elapsed = Date.now() - started;

    // ۱) حتماً تمام می‌شود (اگر معلق بماند، تست با timeout قرمز می‌شود)
    expect(typeof hash).toBe('string');
    // ۲) یا هش معتبر ۱۶ نویسه‌ای، یا رشتهٔ خالی (شکست مهارشده) — نه استثنا
    expect(hash === '' || hash.length === 16).toBe(true);
    // ۳) و در زمان معقول رها می‌کند، نه اینکه کاربر بی‌نهایت منتظر بماند
    expect(elapsed).toBeLessThan(8000);
  }, 15000);

  it('تصویر یکسان به‌عنوان دوقلو تشخیص داده می‌شود (فاصلهٔ صفر)', () => {
    const hash = 'a1b2c3d4e5f60718';
    const match = findDhashDuplicate(hash, [{ id: 'existing-1', dhash: hash }]);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('existing-1');
    expect(match!.distance).toBe(0);
  });

  it('تصویر کاملاً متفاوت دوقلو شمرده نمی‌شود', () => {
    // مثبت کاذب یعنی کاربر برای هر عکس جدید یک هشدار بی‌ربط می‌بیند و
    // خیلی زود یاد می‌گیرد هشدارها را نادیده بگیرد — بدترین حالت.
    const match = findDhashDuplicate('0000000000000000', [
      { id: 'other', dhash: 'ffffffffffffffff' },
    ]);
    expect(match).toBeNull();
  });

  it('نزدیک‌ترین دوقلو انتخاب می‌شود، نه اولین مورد', () => {
    const base = '0000000000000000';
    const match = findDhashDuplicate(base, [
      { id: 'far', dhash: '0000000000000003' },  // فاصلهٔ ۲ بیت
      { id: 'near', dhash: '0000000000000001' }, // فاصلهٔ ۱ بیت
    ]);
    expect(match!.id).toBe('near');
  });

  it('کاندیدای بدون هش یا با هش خراب، مثبت کاذب نمی‌سازد', () => {
    // سناریوی واقعی: عکس‌های قدیمی که پیش از افزودن dHash ثبت شده‌اند و
    // فیلد hash ندارند. نباید باعث خطا یا هشدار اشتباه شوند.
    expect(findDhashDuplicate('a1b2c3d4e5f60718', [{ id: 'legacy', dhash: '' }])).toBeNull();
    expect(findDhashDuplicate('a1b2c3d4e5f60718', [{ id: 'broken', dhash: 'xyz' }])).toBeNull();
    expect(findDhashDuplicate('', [{ id: 'any', dhash: 'a1b2c3d4e5f60718' }])).toBeNull();
  });

  it('آستانهٔ دوقلو محافظه‌کارانه است (عکس قبل/بعد درمان نباید رد شود)', () => {
    // این عدد یک تصمیم بالینی است: عکس «قبل و بعد درمان» عمداً شبیه است و
    // حذف خودکارش دادهٔ ارزشمند می‌سوزاند. آستانهٔ بزرگ‌تر خطرناک است.
    expect(DHASH_TWIN_THRESHOLD).toBeLessThanOrEqual(4);
  });
});

/**
 * تأیید اینکه سد ضدتکرار واقعاً در مسیر آپلود **سیم‌کشی شده** است.
 * بدون این، ممکن است توابع بالا سالم باشند ولی هیچ‌جا صدا زده نشوند —
 * همان مشکل «ماژول یتیم» که ممیزی موج ۱ کشف کرده بود.
 */
describe('تست دود / AUD-13 — اتصال سد به جریان آپلود', () => {
  let source = '';

  beforeEach(async () => {
    const fs = await import('fs');
    const path = await import('path');
    source = fs.readFileSync(
      path.resolve(__dirname, '../../pages/gallery/useGalleryPage.tsx'),
      'utf-8',
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('جریان آپلود واقعاً هش می‌سازد و دوقلو را بررسی می‌کند', () => {
    expect(source).toMatch(/computeDHash\(/);
    expect(source).toMatch(/findDhashDuplicate\(/);
  });

  it('تصمیم نهایی با کاربر است، نه حذف خودکار', () => {
    // قاعدهٔ بالینی نقشه‌راه (W1-2): «بدون حذف خودکار — تصمیم با متخصص».
    // اگر روزی کسی این را به حذف خاموش تغییر دهد، همین‌جا قرمز می‌شود.
    expect(source).toMatch(/confirm\(/);
    expect(source).not.toMatch(/deleteGalleryItem\([^)]*duplicate/i);
  });
});

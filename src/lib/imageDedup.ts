/**
 * imageDedup.ts — فاز ۰٫۴
 *
 * جلوگیری از فراخوانی تکراری و بی‌فایدهٔ سرویس AI روی تصویری که قبلاً
 * تحلیل شده است. انگیزه: هر فراخوانی هزینه/سهمیهٔ API مصرف می‌کند و روی
 * سرویس‌های رایگان به rate-limit می‌خورد؛ ضمن اینکه نتایج تکراری آرشیو
 * بیمار را شلوغ می‌کند.
 *
 * محدودهٔ عمدی: این ماژول فقط *تشخیص* می‌دهد و تصمیم نهایی با کاربر است
 * (ممکن است عمداً بخواهد با مدل دیگری دوباره تحلیل کند).
 */

export interface PriorAnalysisLike {
  id: string;
  clientId: string;
  type: string;
  galleryItemId?: string;
  createdAt: string;
}

export interface DuplicateAnalysisInfo {
  analysisId: string;
  createdAt: string;
  /** چند تحلیل قبلی روی همین تصویر وجود دارد */
  count: number;
}

/**
 * آیا این تصویر قبلاً برای همین مشتری با همین نوع تحلیل، تحلیل شده است؟
 * جدیدترین تحلیل قبلی برگردانده می‌شود.
 */
export function findPriorAnalysisForImage(
  analyses: PriorAnalysisLike[] | undefined | null,
  params: { clientId: string; galleryItemId: string; type: string },
): DuplicateAnalysisInfo | null {
  if (!analyses?.length) return null;
  if (!params.galleryItemId || !params.clientId) return null;

  const matches = analyses.filter(a =>
    a.type === params.type
    && a.clientId === params.clientId
    && a.galleryItemId === params.galleryItemId,
  );
  if (matches.length === 0) return null;

  const newest = matches.reduce((best, cur) =>
    cur.createdAt.localeCompare(best.createdAt) > 0 ? cur : best,
  );
  return {
    analysisId: newest.id,
    createdAt: newest.createdAt,
    count: matches.length,
  };
}

/**
 * هش سبک و پایدار از محتوای تصویر (base64) — برای تشخیص آپلود مجدد
 * *همان* فایل با شناسهٔ گالری متفاوت.
 *
 * عمداً از کل رشته استفاده نمی‌کنیم (برای تصاویر چندمگابایتی کند است)؛
 * ترکیب طول + نمونه‌برداری یکنواخت، برای تشخیص فایل یکسان کافی است و
 * برخورد تصادفی عملاً ناممکن است. این یک هش رمزنگاری‌شده نیست و برای
 * هیچ هدف امنیتی استفاده نمی‌شود.
 */
export function hashImagePayload(base64: string): string {
  if (!base64) return '';
  const payload = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const len = payload.length;
  const samples = 4096;
  const step = Math.max(1, Math.floor(len / samples));

  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < len; i += step) {
    const c = payload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return `${len.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

/**
 * فاز ۵٫۱ — تولید هش ادراکی بصری dHash (Difference Hash) از تصویر.
 * این الگوریتم برای تشخیص تصاویر بصری مشابه که فشرده یا تغییر اندازه داده شده‌اند،
 * به شدت قوی و مناسب ممانعت از تداخل نمونه‌ها در استخر یادگیری ماشین است.
 */
/**
 * سقف انتظار برای بارگذاری تصویر پیش از رها کردن محاسبهٔ هش.
 *
 * فاز ۴ (AUD-17) — چرا لازم است: این تابع فقط با `onload`/`onerror` تمام
 * می‌شد. اگر مرورگر هیچ‌کدام را شلیک نکند (فایل خراب، فرمت پشتیبانی‌نشده، یا
 * موتور رندری که آن نوع تصویر را نمی‌شناسد)، Promise **برای همیشه معلق**
 * می‌ماند. مصرف‌کننده در `useGalleryPage.tsx:423` روی همین Promise `await`
 * می‌کند و داخل حلقهٔ آپلود است — یعنی کل آپلود قفل می‌شود و کاربر تا ابد
 * چرخندهٔ «در حال آپلود» می‌بیند، بدون هیچ پیام خطایی.
 *
 * ۵ ثانیه برای تغییر اندازه به ۹×۸ بسیار سخاوتمندانه است؛ هدف فقط شکستن
 * حالت قفل ابدی است، نه محدود کردن کار عادی.
 */
const DHASH_LOAD_TIMEOUT_MS = 5000;

export function computeDHash(base64: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      // در محیط‌های تستی غیرمرورگر، یک هش شبیه‌سازی شده برمی‌گردانیم تا بیلد نشکند
      resolve(hashImagePayload(base64).slice(0, 16).padEnd(16, '0'));
      return;
    }

    // تضمین می‌کند Promise دقیقاً یک‌بار و حتماً تمام می‌شود
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // رشتهٔ خالی یعنی «هش نداریم»؛ مصرف‌کننده با `|| undefined` آن را به
    // «بدون دوقلو» ترجمه می‌کند و آپلود عادی ادامه می‌یابد — یعنی شکستِ
    // تشخیص تکراری هرگز جلوی ثبت عکس بیمار را نمی‌گیرد.
    const timer = setTimeout(() => finish(''), DHASH_LOAD_TIMEOUT_MS);

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish('');
          return;
        }
        ctx.drawImage(img, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8).data;

        const gray: number[] = [];
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          gray.push(0.299 * r + 0.587 * g + 0.114 * b);
        }

        let binary = '';
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const left = gray[row * 9 + col];
            const right = gray[row * 9 + col + 1];
            binary += left > right ? '1' : '0';
          }
        }

        let hex = '';
        for (let i = 0; i < 64; i += 4) {
          const nibble = binary.slice(i, i + 4);
          hex += parseInt(nibble, 2).toString(16);
        }
        finish(hex);
      } catch {
        finish('');
      }
    };
    img.onerror = () => finish('');
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/** آستانهٔ فاصلهٔ همینگ برای «دوقلوی بصری» — محافظه‌کارانه؛ تصمیم نهایی با کاربر است */
export const DHASH_TWIN_THRESHOLD = 4;

export interface DhashCandidate {
  id: string;
  dhash: string;
}

export interface DhashDuplicateMatch {
  id: string;
  distance: number;
}

/**
 * موج ۱ (W1-2) — نزدیک‌ترین تصویر موجود به dHash جدید را پیدا می‌کند
 * (دوقلوی بصری بالقوه). مثل بقیهٔ این ماژول فقط «تشخیص» می‌دهد و
 * تصمیم نهایی (ثبت یا استفاده از تصویر قبلی) با کاربر می‌ماند.
 */
export function findDhashDuplicate(
  newDhash: string,
  candidates: DhashCandidate[],
  threshold = DHASH_TWIN_THRESHOLD,
): DhashDuplicateMatch | null {
  if (!newDhash || newDhash.length !== 16 || !candidates.length) return null;
  let best: DhashDuplicateMatch | null = null;
  for (const c of candidates) {
    if (!c.dhash || c.dhash.length !== 16) continue;
    const distance = calculateHammingDistance(newDhash, c.dhash);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { id: c.id, distance };
    }
  }
  return best;
}

/**
 * فاز ۵٫۱ — محاسبهٔ فاصلهٔ همینگ (Hamming Distance) بین دو dHash.
 * فاصلهٔ کمتر یا مساوی ۴ نشان‌دهندهٔ تشابه بصری به شدت بالا (دوقلو) است.
 */
export function calculateHammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== 16 || hash2.length !== 16) return 99;
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);
    let xor = val1 ^ val2;
    while (xor > 0) {
      if (xor & 1) distance++;
      xor >>= 1;
    }
  }
  return distance;
}

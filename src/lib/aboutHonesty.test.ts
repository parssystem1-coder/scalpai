import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * فاز ۳ / AUD-1 — گارد صداقت فنی صفحهٔ «دربارهٔ ما»
 * -----------------------------------------------------------------------
 * پیشینه: در ممیزی موج ۱ معلوم شد صفحهٔ About ادعای «کالیبراسیون دما
 * (Temperature Scaling)» می‌کرد در حالی که آن قابلیت اصلاً در کد نبود. متن
 * اصلاح شد، ولی DoD نقشه‌راه — «تستی که جلوی بازگشت ادعای جعلی را بگیرد» —
 * هرگز ساخته نشد. این فایل همان بدهی است.
 *
 * روش کار (الگوی `engineParity.test.ts`): سورس `About.tsx` خوانده می‌شود و
 * هر ادعای فنی‌اش باید یک **لنگر کد** داشته باشد — یعنی جایی در مخزن که آن
 * قابلیت واقعاً پیاده شده باشد. اگر کسی ادعایی اضافه کند که پشتوانهٔ کد
 * ندارد، یا قابلیتی حذف شود ولی ادعایش بماند، این تست قرمز می‌شود.
 *
 * چرا مهم است: این صفحه چیزی است که پزشک/خریدار می‌خواند. ادعای اثبات‌ناپذیر
 * در یک محصول بالینی فقط یک باگ متنی نیست.
 */

const repoRoot = path.resolve(__dirname, '../..');
const readRepoFile = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf-8');

const aboutSource = readRepoFile('src/pages/About.tsx');

/**
 * هر ادعای فنی صفحهٔ About به یک شاهد واقعی در کد گره خورده است.
 * `claim`: عبارتی که در متن صفحه دیده می‌شود.
 * `anchorFile` + `anchorPattern`: جایی که آن قابلیت واقعاً پیاده شده.
 */
const CLAIM_ANCHORS: Array<{
  label: string;
  claim: RegExp;
  anchorFile: string;
  anchorPattern: RegExp;
}> = [
  {
    label: 'سگمنتیشن Otsu',
    claim: /Otsu/,
    anchorFile: 'src/lib/scalpFeatures.ts',
    anchorPattern: /otsu/i,
  },
  {
    label: 'Focal Loss',
    claim: /Focal Loss/,
    anchorFile: 'src/lib/localModel.ts',
    anchorPattern: /\bfocalLoss\b/,
  },
  {
    label: 'سنجش کالیبراسیون با ECE و Brier',
    claim: /ECE (و|and) Brier/,
    anchorFile: 'src/lib/calibrationPresentation.ts',
    anchorPattern: /export function eceBand\b|export const ECE_GREEN_MAX\b/,
  },
  {
    label: 'MC-Dropout',
    claim: /MC-Dropout/,
    anchorFile: 'src/lib/localModel.ts',
    anchorPattern: /function predictWithMCDropout\b/,
  },
  {
    label: 'فاصلهٔ ماهالانوبیس برای OOD',
    claim: /ماهالانوبیس|Mahalanobis/,
    anchorFile: 'src/lib/outOfDistribution.ts',
    anchorPattern: /export function calculateMahalanobisDistance\b/,
  },
  {
    label: 'dHash و فاصلهٔ همینگ',
    claim: /dHash/,
    anchorFile: 'src/lib/imageDedup.ts',
    anchorPattern: /export (async )?function computeDHash\b/,
  },
  {
    label: 'رمزنگاری تصاویر با AES-256-GCM',
    claim: /AES-256-GCM/,
    anchorFile: 'electron/file-crypto.cjs',
    anchorPattern: /aes-256-gcm/,
  },
  {
    label: 'رمزنگاری دیتابیس با SQLCipher',
    claim: /SQLCipher/,
    anchorFile: 'electron/sqlite-driver.cjs',
    anchorPattern: /better-sqlite3-multiple-ciphers/,
  },
];

describe('فاز ۳ / AUD-1 — هر ادعای صفحهٔ About پشتوانهٔ کد دارد', () => {
  it.each(CLAIM_ANCHORS)('ادعای «$label» هم در متن هست و هم در کد پیاده شده', ({ claim, anchorFile, anchorPattern }) => {
    // ۱) ادعا واقعاً در صفحه هست (اگر متن عوض شد، این لنگر باید به‌روز شود)
    expect(claim.test(aboutSource), `ادعا در About.tsx پیدا نشد: ${claim}`).toBe(true);
    // ۲) و پشتوانهٔ واقعی در کد دارد
    const anchorSource = readRepoFile(anchorFile);
    expect(
      anchorPattern.test(anchorSource),
      `ادعا در About هست ولی پیاده‌سازی‌اش در ${anchorFile} پیدا نشد — یا قابلیت حذف شده یا ادعا بی‌پشتوانه است`,
    ).toBe(true);
  });

  /**
   * آزمون منفی — مهم‌ترین تست این فایل.
   * تستی که هرگز قرمز نمی‌شود، تست نیست. این‌جا ثابت می‌کنیم سازوکار بالا
   * واقعاً کار می‌کند: یک ادعای ساختگی می‌سازیم که هیچ لنگری در کد ندارد و
   * انتظار داریم بررسی شکست بخورد.
   */
  it('آزمون منفی: ادعای بی‌پشتوانه واقعاً رد می‌شود', () => {
    const fakeClaimSource = `desc: 'مجهز به تشخیص کوانتومی ملانوما با دقت ۹۹٪'`;
    const fakeAnchor = /quantumMelanomaDetector/;
    // ادعا در «متن» هست…
    expect(/کوانتومی/.test(fakeClaimSource)).toBe(true);
    // …ولی هیچ لنگری در کد ندارد — و سازوکار ما باید همین را بگیرد
    // نکته: خودِ همین فایل تست حاوی آن رشته است، پس از جست‌وجو کنارش می‌گذاریم
    // وگرنه تست به خودش ارجاع می‌دهد و بی‌معنا می‌شود.
    const anchorExists = fs
      .readdirSync(path.join(repoRoot, 'src/lib'))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .some(f => fakeAnchor.test(readRepoFile(path.join('src/lib', f))));
    expect(anchorExists).toBe(false);
  });

  /**
   * ادعاهایی که در گذشته جعلی بودند و نباید بی‌سروصدا برگردند.
   * «Temperature Scaling» حالا واقعاً پیاده شده، ولی فقط **مشروط** اعمال
   * می‌شود؛ پس ادعای بدون قید دربارهٔ آن ممنوع است.
   */
  it('ادعای بدون‌قید دربارهٔ کالیبراسیون دما برنگشته است', () => {
    const hasTemperatureClaim = /(کالیبراسیون دما|Temperature Scaling|temperature scaling)/i.test(aboutSource);
    if (hasTemperatureClaim) {
      // اگر ذکر شده، حتماً باید با قید «مشروط/پس از تأیید نیاز» همراه باشد
      const isQualified = /(پس از تأیید نیاز|only after|مشروط)/i.test(aboutSource);
      expect(
        isQualified,
        'کالیبراسیون دما فقط مشروط اعمال می‌شود؛ ادعای بدون قید در About مجاز نیست',
      ).toBe(true);
    }
  });

  it('متن فارسی و انگلیسی هم‌تعداد است (یکی بدون دیگری به‌روز نشده)', () => {
    // هر آیتم قابلیت دقیقاً یک زوج fa/en دارد؛ اگر کسی فقط فارسی را عوض کند
    // و انگلیسی جا بماند، اختلاف شمارش این را لو می‌دهد.
    const titleCount = (aboutSource.match(/title: isRtl \?/g) || []).length;
    const descCount = (aboutSource.match(/desc: isRtl/g) || []).length;
    expect(titleCount).toBeGreaterThan(0);
    expect(descCount).toBe(titleCount);
  });

  it('هیچ ادعای عددی بدون سند در About نیست', () => {
    // اعداد دقت/حساسیت («۹۵٪ دقت») بدون مطالعهٔ بالینی، نقض امانت‌داری آماری
    // است. این گارد جلوی وسوسهٔ بازاریابی را می‌گیرد.
    const accuracyClaim = /(دقت|accuracy|sensitivity|specificity)[^.\n]{0,20}[٪%]/i;
    expect(
      accuracyClaim.test(aboutSource),
      'ادعای عددی دقت/حساسیت بدون مطالعهٔ بالینی مجاز نیست',
    ).toBe(false);
  });
});

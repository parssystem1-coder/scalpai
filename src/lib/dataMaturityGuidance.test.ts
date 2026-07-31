import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildDataMaturityReport, type MaturityInput } from './dataMaturity';
import { CALIBRATION_VERSION } from './heuristicConstants';

/**
 * راهنمای کادر بلوغ داده + نسخهٔ کالیبراسیون (AUD-18)
 * -----------------------------------------------------------------------
 * دو خواستهٔ مالک محصول که این‌جا گارد می‌شوند:
 *
 * ۱) کادر کهربایی باید برای **متخصص بالینی** قابل فهم باشد و بگوید هر نمودار
 *    بعد از سبز شدن چه اتفاقی می‌افتد — نه اینکه فقط عدد نشان دهد.
 * ۲) وقتی همه سبز شد، دستورالعمل «حالا چه کنیم؟» باید همان‌جا جلوی چشم باشد،
 *    چون سندها گم می‌شوند و خوانده نمی‌شوند.
 *
 * و یک یافتهٔ فنی (AUD-18): تحلیل‌های ذخیره‌شده باید بدانند با کدام نسخهٔ
 * ضرایب ساخته شده‌اند، وگرنه روزی که کالیبراسیون انجام شود نمودار روند بیمار
 * بی‌صدا بی‌معنا می‌شود.
 */

const emptyInput: MaturityInput = {
  eligibleSampleCount: 0,
  aiAgreementSampleCount: 0,
  distinctClientCount: 0,
  suppressedLabelCount: 75,
  totalLabelCount: 75,
};

/** ورودی‌ای که همهٔ حد نصاب‌ها را برآورده می‌کند */
const readyInput: MaturityInput = {
  eligibleSampleCount: 500,
  aiAgreementSampleCount: 200,
  distinctClientCount: 60,
  suppressedLabelCount: 0,
  totalLabelCount: 75,
};

/** اصطلاحاتی که نباید در متن رو به متخصص بالینی ظاهر شوند */
const JARGON = [
  'رگرسیون',
  'holdout',
  'embedding',
  'overfit',
  'MAE',
  'F1',
  'isotonic',
  'K-Fold',
  'prompt',
  'heuristic',
];

describe('AUD-13/کادر بلوغ — متن قابل فهم برای متخصص بالینی', () => {
  it('هر نمودار توضیح ساده و «بعدش چه می‌شود» دارد', () => {
    const r = buildDataMaturityReport(emptyInput);
    expect(r.gauges.length).toBeGreaterThan(0);
    for (const g of r.gauges) {
      for (const field of ['plainFa', 'plainEn', 'whenReadyFa', 'whenReadyEn', 'unitFa', 'unitEn'] as const) {
        expect(g[field], `نمودار «${g.id}» فیلد ${field} ندارد`).toBeTruthy();
        expect(String(g[field]).trim().length, `${g.id}.${field} خالی است`).toBeGreaterThan(0);
      }
    }
  });

  it('توضیح ساده واقعاً ساده است — بدون اصطلاح فنی', () => {
    // این گارد جلوی بازگشت تدریجی زبان مهندسی را می‌گیرد. متن `actionFa`
    // عمداً استثناست: آن برای تیم فنی است، نه پزشک.
    const r = buildDataMaturityReport(emptyInput);
    for (const g of r.gauges) {
      const clinicalText = `${g.plainFa} ${g.whenReadyFa} ${g.titleFa}`;
      for (const word of JARGON) {
        expect(
          clinicalText.includes(word),
          `متن بالینی نمودار «${g.id}» شامل اصطلاح فنی «${word}» است`,
        ).toBe(false);
      }
    }
  });

  it('توضیح ساده به‌اندازهٔ کافی گویا است (نه یک کلمه)', () => {
    const r = buildDataMaturityReport(emptyInput);
    for (const g of r.gauges) {
      expect(g.plainFa.length, `توضیح «${g.id}» خیلی کوتاه است`).toBeGreaterThan(30);
      expect(g.whenReadyFa.length, `«بعدش» برای «${g.id}» خیلی کوتاه است`).toBeGreaterThan(30);
    }
  });
});

describe('کادر بلوغ — دستورالعمل «حالا چه کنیم؟»', () => {
  it('فهرست قدم‌های بعدی همیشه ساخته می‌شود و خالی نیست', () => {
    // حتی وقتی هنوز سبز نشده، UI پیش‌نمایشش را نشان می‌دهد تا کاربر بداند
    // چه چیزی در انتظارش است.
    for (const input of [emptyInput, readyInput]) {
      const r = buildDataMaturityReport(input);
      expect(r.nextSteps.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('قدم‌ها ترتیب یکتا و پشت‌سرهم دارند', () => {
    const r = buildDataMaturityReport(readyInput);
    const orders = r.nextSteps.map(s => s.order);
    expect(new Set(orders).size, 'شمارهٔ قدم‌ها تکراری است').toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('اولین قدم حتماً پشتیبان‌گیری است', () => {
    // قانون ایمنی: پیش از تغییر معیار نمره‌دهی، باید راه بازگشت وجود داشته باشد.
    const r = buildDataMaturityReport(readyInput);
    const first = r.nextSteps.find(s => s.order === 1)!;
    expect(first.titleFa).toMatch(/پشتیبان/);
  });

  it('قدم هماهنگی دو موتور فراموش نشده است', () => {
    // پیش‌نیاز فنی حیاتی: اگر ضرایب فقط در یک موتور عوض شود، همان عکس روی
    // دو کامپیوتر دو نتیجهٔ متفاوت می‌دهد — بی‌صدا.
    const r = buildDataMaturityReport(readyInput);
    expect(r.nextSteps.some(s => s.id === 'engineParity')).toBe(true);
  });

  it('هر قدم مشخص می‌کند مسئولش کیست', () => {
    const r = buildDataMaturityReport(readyInput);
    for (const s of r.nextSteps) {
      expect(s.ownerFa.trim().length, `قدم «${s.id}» مسئول ندارد`).toBeGreaterThan(0);
      expect(s.detailFa.length, `قدم «${s.id}» توضیح ندارد`).toBeGreaterThan(20);
    }
  });
});

describe('AUD-18 — ثبت نسخهٔ ضرایب در هر تحلیل', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const readRepo = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf-8');

  it('نسخهٔ کالیبراسیون تعریف شده و از فایل مشترک می‌آید', () => {
    expect(typeof CALIBRATION_VERSION).toBe('string');
    expect(CALIBRATION_VERSION.length).toBeGreaterThan(0);
    const shared = JSON.parse(readRepo('shared/scalp-constants.json'));
    expect(CALIBRATION_VERSION).toBe(shared.CALIBRATION_VERSION);
  });

  it('خروجی تحلیل نسخهٔ ضرایب را ثبت می‌کند', () => {
    // بدون این، اگر روزی ضرایب کالیبره شوند نمودار روند بیمار بی‌صدا بی‌معنا
    // می‌شود: پزشک تغییر عدد را «بهبود بالینی» می‌خواند در حالی که فقط خط‌کش
    // عوض شده است.
    const src = readRepo('src/lib/scalpFeatures.ts');
    expect(src).toMatch(/calibrationVersion: string;/);
    expect(src).toMatch(/calibrationVersion: CALIBRATION_VERSION/);
  });

  it('نسخهٔ فعلی صراحتاً «تخمینی» بودن را اعلام می‌کند', () => {
    // تا وقتی با دادهٔ واقعی کالیبره نشده، خودِ شناسه باید این را بگوید —
    // نه اینکه شبیه یک نسخهٔ نهایی و معتبر به‌نظر برسد.
    expect(CALIBRATION_VERSION).toMatch(/estimate|تخمین/i);
  });
});

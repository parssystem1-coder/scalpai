import { describe, it, expect } from 'vitest';
import { computeHealthScore, healthScoreColor, healthScoreTier } from './healthScore';

/** ساخت ورودی با مقادیر پیش‌فرض سالم */
const input = (
  density: number,
  condition: Partial<Parameters<typeof computeHealthScore>[0]['scalpCondition']> = {},
) => ({ hairDensity: { score: density }, scalpCondition: condition });

describe('computeHealthScore', () => {
  it('همیشه عددی صحیح در بازهٔ ۰ تا ۱۰۰ می‌دهد', () => {
    const extremes = [-500, -1, 0, 50, 100, 1000, Number.MAX_SAFE_INTEGER];
    for (const d of extremes) {
      for (const v of extremes) {
        const score = computeHealthScore(
          input(d, { oiliness: v, dryness: v, dandruff: v, redness: v, patchiness: v, pigmentation: v }),
        );
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('پوست سر کاملاً سالم امتیاز ۱۰۰ می‌گیرد', () => {
    expect(computeHealthScore(input(100, {}))).toBe(100);
  });

  it('بدترین حالت ممکن امتیاز صفر می‌گیرد', () => {
    const worst = { oiliness: 100, dryness: 100, dandruff: 100, redness: 100, patchiness: 100, pigmentation: 100 };
    expect(computeHealthScore(input(0, worst))).toBe(0);
  });

  it('تراکم بیشتر ⇒ امتیاز بیشتر (یکنواخت صعودی)', () => {
    let previous = -1;
    for (let d = 0; d <= 100; d += 10) {
      const score = computeHealthScore(input(d, { oiliness: 30, dryness: 20 }));
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('هر مشکل پوستی امتیاز را کم می‌کند یا ثابت نگه می‌دارد (هرگز زیاد نمی‌کند)', () => {
    const base = computeHealthScore(input(70));
    const keys = ['oiliness', 'dryness', 'dandruff', 'redness', 'patchiness', 'pigmentation'] as const;
    for (const key of keys) {
      const worse = computeHealthScore(input(70, { [key]: 80 }));
      expect(worse).toBeLessThan(base);
    }
  });

  it('شوره بیشترین وزن جریمه را دارد (۰.۲۵)', () => {
    const withDandruff = computeHealthScore(input(70, { dandruff: 100 }));
    const withRedness = computeHealthScore(input(70, { redness: 100 }));
    const withPatchiness = computeHealthScore(input(70, { patchiness: 100 }));
    expect(withDandruff).toBeLessThan(withRedness);
    expect(withRedness).toBeLessThan(withPatchiness);
  });

  it('فیلدهای اختیاری غایب مثل صفر رفتار می‌کنند (نه NaN)', () => {
    const empty = computeHealthScore(input(60, {}));
    const zeros = computeHealthScore(
      input(60, { oiliness: 0, dryness: 0, dandruff: 0, redness: 0, patchiness: 0, pigmentation: 0 }),
    );
    expect(empty).toBe(zeros);
    expect(Number.isNaN(empty)).toBe(false);
  });
});

describe('healthScoreTier و healthScoreColor', () => {
  it('مرزهای دسته‌بندی دقیق هستند', () => {
    expect(healthScoreTier(100)).toBe('excellent');
    expect(healthScoreTier(80)).toBe('excellent');
    expect(healthScoreTier(79)).toBe('good');
    expect(healthScoreTier(60)).toBe('good');
    expect(healthScoreTier(59)).toBe('fair');
    expect(healthScoreTier(40)).toBe('fair');
    expect(healthScoreTier(39)).toBe('needsAttention');
    expect(healthScoreTier(0)).toBe('needsAttention');
  });

  it('رنگ و دسته همیشه هم‌راستا هستند', () => {
    const colorForTier: Record<string, string> = {
      excellent: '#22c55e',
      good: '#10b981',
      fair: '#eab308',
      needsAttention: '#ef4444',
    };
    for (let s = 0; s <= 100; s += 1) {
      expect(healthScoreColor(s)).toBe(colorForTier[healthScoreTier(s)]);
    }
  });

  it('برای هر امتیاز معتبر یک رنگ hex برمی‌گرداند', () => {
    for (let s = 0; s <= 100; s += 1) {
      expect(healthScoreColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

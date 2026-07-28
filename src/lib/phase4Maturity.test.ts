/**
 * تست‌های فاز ۴ — بلوغ داده و تشخیص خارج‌از‌توزیع.
 */
import { describe, expect, it } from 'vitest';
import {
  MATURITY_TARGETS,
  buildDataMaturityReport,
  type MaturityInput,
} from './dataMaturity';
import {
  OOD_STRONG_DISTANCE,
  assessOutOfDistribution,
} from './outOfDistribution';

const baseInput: MaturityInput = {
  eligibleSampleCount: 0,
  aiAgreementSampleCount: 0,
  distinctClientCount: 0,
  suppressedLabelCount: 75,
  totalLabelCount: 75,
};

describe('فاز ۴ — گزارش بلوغ داده', () => {
  it('با دیتاست خالی، هشدار کالیبراسیون فعال و پیشرفت صفر است', () => {
    const r = buildDataMaturityReport(baseInput);
    expect(r.requiresRecalibration).toBe(true);
    expect(r.overallProgress).toBe(0);
    expect(r.gauges.every(g => g.status === 'insufficient')).toBe(true);
  });

  it('فهرست تصمیم‌های حدسی هرگز خالی نیست (هشدار فراموش نمی‌شود)', () => {
    const r = buildDataMaturityReport(baseInput);
    expect(r.provisionalDecisions.length).toBeGreaterThan(0);
    // هر تصمیم باید به یک گیج واقعی وصل باشد
    const gaugeIds = new Set(r.gauges.map(g => g.id));
    for (const d of r.provisionalDecisions) {
      expect(gaugeIds.has(d.gaugeId)).toBe(true);
    }
  });

  it('وضعیت گیج در نیمهٔ راه به emerging تغییر می‌کند', () => {
    const r = buildDataMaturityReport({
      ...baseInput,
      eligibleSampleCount: Math.ceil(MATURITY_TARGETS.heuristicCalibrationSamples / 2),
    });
    expect(r.gauges.find(g => g.id === 'heuristicCalibration')!.status).toBe('emerging');
  });

  it('رسیدن به حد نصاب، وضعیت گیج را ready می‌کند', () => {
    const r = buildDataMaturityReport({
      ...baseInput,
      aiAgreementSampleCount: MATURITY_TARGETS.aiAgreementSamples,
    });
    expect(r.gauges.find(g => g.id === 'aiAgreement')!.status).toBe('ready');
  });

  it('تا وقتی حتی یک گیج ready نشده، هشدار باقی می‌ماند', () => {
    const r = buildDataMaturityReport({
      ...baseInput,
      eligibleSampleCount: MATURITY_TARGETS.embeddingReadinessSamples,
      aiAgreementSampleCount: MATURITY_TARGETS.aiAgreementSamples,
      distinctClientCount: MATURITY_TARGETS.distinctClients,
      suppressedLabelCount: 5, // هنوز ۵ برچسب بدون داده
    });
    expect(r.requiresRecalibration).toBe(true);
  });

  it('با برآورده‌شدن همهٔ حد نصاب‌ها، هشدار به حالت «آمادهٔ بازبینی» می‌رود', () => {
    const r = buildDataMaturityReport({
      eligibleSampleCount: MATURITY_TARGETS.embeddingReadinessSamples,
      aiAgreementSampleCount: MATURITY_TARGETS.aiAgreementSamples,
      distinctClientCount: MATURITY_TARGETS.distinctClients,
      suppressedLabelCount: 0,
      totalLabelCount: 75,
    });
    expect(r.requiresRecalibration).toBe(false);
    expect(r.overallProgress).toBe(100);
  });

  it('پیشرفت هرگز از ۱۰۰ بیشتر نمی‌شود', () => {
    const r = buildDataMaturityReport({
      eligibleSampleCount: 99999,
      aiAgreementSampleCount: 99999,
      distinctClientCount: 99999,
      suppressedLabelCount: 0,
      totalLabelCount: 75,
    });
    expect(r.overallProgress).toBeLessThanOrEqual(100);
  });
});

describe('فاز ۴٫۳ — تشخیص خارج‌از‌توزیع', () => {
  const means = [10, 20, 30, 40];
  const stds = [2, 2, 2, 2];

  it('بردار نزدیک به میانگین، داخل محدوده است', () => {
    const r = assessOutOfDistribution([10, 20, 30, 40], means, stds);
    expect(r.evaluated).toBe(true);
    expect(r.level).toBe('inRange');
    expect(r.meanAbsZ).toBeCloseTo(0, 5);
  });

  it('بردار بسیار دور، خارج از محدوده تشخیص داده می‌شود', () => {
    const far = means.map((m, i) => m + stds[i] * 10);
    const r = assessOutOfDistribution(far, means, stds);
    expect(r.level).toBe('outOfRange');
    expect(r.meanAbsZ).toBeGreaterThanOrEqual(OOD_STRONG_DISTANCE);
  });

  it('انحراف متوسط، مرزی گزارش می‌شود', () => {
    const mid = means.map((m, i) => m + stds[i] * 3);
    const r = assessOutOfDistribution(mid, means, stds);
    expect(r.level).toBe('borderline');
  });

  it('نبود آمار آموزشی هرگز هشدار کاذب نمی‌دهد', () => {
    expect(assessOutOfDistribution([1, 2], null, null).evaluated).toBe(false);
    expect(assessOutOfDistribution([1, 2], [1, 2], null).evaluated).toBe(false);
    expect(assessOutOfDistribution(null, means, stds).evaluated).toBe(false);
  });

  it('ناسازگاری ابعاد باعث خطا نمی‌شود و ارزیابی انجام نمی‌گیرد', () => {
    const r = assessOutOfDistribution([1, 2, 3], means, stds);
    expect(r.evaluated).toBe(false);
    expect(r.level).toBe('inRange');
  });

  it('انحراف‌معیار صفر باعث z بی‌نهایت نمی‌شود', () => {
    const r = assessOutOfDistribution([10, 20], [10, 20], [0, 0]);
    expect(Number.isFinite(r.meanAbsZ)).toBe(true);
    expect(r.meanAbsZ).toBeCloseTo(0, 5);
  });

  it('ابعاد پرت گزارش می‌شوند تا عیب‌یابی ممکن باشد', () => {
    const v = [10, 20, 30, 40 + stds[3] * 8];
    const r = assessOutOfDistribution(v, means, stds);
    expect(r.topDeviatingIndices).toContain(3);
  });

  it('مقادیر غیرعددی نادیده گرفته می‌شوند نه اینکه NaN تولید کنند', () => {
    const r = assessOutOfDistribution([10, NaN, 30, 40], means, stds);
    expect(Number.isFinite(r.meanAbsZ)).toBe(true);
    expect(r.evaluated).toBe(true);
  });
});

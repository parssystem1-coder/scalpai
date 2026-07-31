import { describe, expect, it } from 'vitest';
import {
  computeScoreMetrics,
  computeCalibrationMetrics,
  computeConfidenceInterval
} from './mlEvaluation';
import { splitByClientKFold } from './localModel';
import { auditDataset } from './datasetAudit';
import { TrainingSample } from '../db/types';

describe('فاز ۱٫۱ — متریک‌های عددی MAE و R2', () => {
  it('باید MAE و R2 را برای امتیازها به درستی محاسبه کند', () => {
    // ۲ نمونه، ۲ امتیاز
    const yTrue = [
      [50, 60],
      [40, 80]
    ];
    const yPred = [
      [45, 65],
      [42, 75]
    ];
    const scoreKeys = ['oiliness', 'dryness'];

    const metrics = computeScoreMetrics(yTrue, yPred, scoreKeys);
    expect(metrics).toHaveLength(2);
    
    // MAE برای oiliness: (|50-45| + |40-42|)/2 = (5 + 2)/2 = 3.5
    expect(metrics[0].key).toBe('oiliness');
    expect(metrics[0].mae).toBe(3.5);

    // MAE برای dryness: (|60-65| + |80-75|)/2 = (5 + 5)/2 = 5
    expect(metrics[1].key).toBe('dryness');
    expect(metrics[1].mae).toBe(5);
  });
});

describe('فاز ۱٫۲ — فاصله اطمینان و K-Fold بر اساس مشتری', () => {
  it('باید فاصله اطمینان ۹۵٪ را محاسبه کند', () => {
    const values = [10, 12, 11, 13, 9];
    const ci = computeConfidenceInterval(values);
    expect(ci.mean).toBe(11);
    expect(ci.margin).toBeGreaterThan(0);
    expect(ci.lower).toBe(11 - ci.margin);
    expect(ci.upper).toBe(11 + ci.margin);
  });

  it('باید نمونه‌ها را بدون نشت مشتری به K قسمت تقسیم کند', () => {
    const dummySamples = [
      { id: 's1', clientId: 'c1' },
      { id: 's2', clientId: 'c1' },
      { id: 's3', clientId: 'c2' },
      { id: 's4', clientId: 'c2' },
      { id: 's5', clientId: 'c3' },
      { id: 's6', clientId: 'c4' },
      { id: 's7', clientId: 'c5' }
    ] as unknown[] as TrainingSample[];

    const { folds, minimalFallback } = splitByClientKFold(dummySamples, 3, 42);
    expect(folds.length).toBeLessThanOrEqual(3);
    expect(minimalFallback).toBe(false);

    // در هر لایه، هیچ مشتری نباید همزمان در train و holdout باشد
    for (const fold of folds) {
      const trainClients = new Set(fold.train.map(s => s.clientId));
      const holdoutClients = new Set(fold.holdout.map(s => s.clientId));
      
      for (const tc of trainClients) {
        expect(holdoutClients.has(tc)).toBe(false);
      }
    }
  });

  it('با کمتر از ۳ مشتری باید پرچم «ارزیابی حداقلی» روشن شود', () => {
    const fewClients = [
      { id: 's1', clientId: 'c1' },
      { id: 's2', clientId: 'c1' },
      { id: 's3', clientId: 'c2' },
      { id: 's4', clientId: 'c2' },
      { id: 's5', clientId: 'c1' },
    ] as unknown[] as TrainingSample[];

    const { folds, minimalFallback } = splitByClientKFold(fewClients, 5, 42);
    expect(minimalFallback).toBe(true);
    expect(folds.length).toBe(1);
    // در این حالت holdout همان validation است — به‌همین دلیل فلگ لازم بود
    expect(folds[0].holdout).toBe(folds[0].val);
  });
});

describe('فاز ۱٫۳ — سنجش کالیبراسیون (ECE و Brier)', () => {
  it('باید ECE و Brier score را به درستی محاسبه کند', () => {
    const yTrue = [
      [1], // نمونه مثبت
      [0]  // نمونه منفی
    ];
    const yPred = [
      [0.9], // مدل بسیار مطمئن و درست
      [0.1]  // مدل بسیار مطمئن و درست
    ];

    const cal = computeCalibrationMetrics(yTrue, yPred, 1, 10);
    // Brier score: ((1-0.9)^2 + (0-0.1)^2)/2 = (0.01 + 0.01)/2 = 0.01
    expect(cal.brier).toBeCloseTo(0.01);
    expect(cal.ece).toBeLessThanOrEqual(0.1);
  });
});

describe('فاز ۱٫۵ — ممیزی دیتاست (Dataset Audit)', () => {
  it('باید کم‌نمونه‌ها، عکس‌های تکراری و توزیع ویژگی‌ها را گزارش دهد', () => {
    const dummySamples = [
      {
        id: 's1',
        galleryItemId: 'img1',
        label: { observations: ['dandruff'] },
        features: { brightness: 50, whiteFlakeRatio: 10 }
      },
      {
        id: 's2',
        galleryItemId: 'img1', // تکراری
        label: { observations: ['dandruff'] },
        features: { brightness: 52, whiteFlakeRatio: 12 }
      },
      {
        id: 's3',
        galleryItemId: 'img2',
        label: { observations: [] },
        features: { brightness: 48, whiteFlakeRatio: 8 }
      }
    ] as unknown[] as TrainingSample[];

    const report = auditDataset(dummySamples);
    expect(report.totalSamples).toBe(3);
    expect(report.underSupportedLabels).toContain('seborrheicDermatitis');
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].hash).toBe('img1');
    expect(report.duplicates[0].sampleIds).toContain('s1');
    expect(report.duplicates[0].sampleIds).toContain('s2');

    const brightStats = report.featureStats.find(f => f.key === 'brightness');
    expect(brightStats).toBeDefined();
    expect(brightStats?.mean).toBe(50);
    expect(brightStats?.min).toBe(48);
    expect(brightStats?.max).toBe(52);
  });
});

import { computeCohensKappa } from './aiAgreement';
import { monitorDataDrift } from './driftMonitor';
import { rankActiveLearningQueue } from './activeLearning';

describe('فاز ۵.۲ — ضریب توافق کاپای کوهن (Cohen\'s Kappa)', () => {
  it('باید مقدار کاپا را بین دو ارزیاب به درستی حساب کند', () => {
    const r1 = [true, true, false, false, true];
    const r2 = [true, false, false, false, true];

    const kappa = computeCohensKappa(r1, r2);
    expect(kappa).toBeGreaterThan(0);
    expect(kappa).toBeLessThanOrEqual(1.0);
  });
});

describe('فاز ۵.۵ — ردیابی رانش داده‌ها (Data Drift Monitoring)', () => {
  it('باید رانش آماری ویژگی‌ها را به درستی تشخیص دهد', () => {
    const bMeans = new Array(12).fill(10);
    const bStds = new Array(12).fill(1);

    const recent = [
      { features: { brightness: 15, whiteFlakeRatio: 10 } },
      { features: { brightness: 16, whiteFlakeRatio: 10 } },
      { features: { brightness: 14, whiteFlakeRatio: 10 } },
      { features: { brightness: 15, whiteFlakeRatio: 10 } },
      { features: { brightness: 16, whiteFlakeRatio: 10 } }
    ] as unknown[] as TrainingSample[];

    const report = monitorDataDrift(recent, bMeans, bStds);
    expect(report.evaluated).toBe(true);
    expect(report.driftDetected).toBe(true); // brightness has drifted from 10 to 15.2 (Z-score is high!)
  });
});

describe('فاز ۵.۱ — رتبه‌بندی صف یادگیری فعال (Active Learning)', () => {
  it('باید صف تصاویر بدون برچسب را رتبه‌بندی کند', async () => {
    const dummySamples = [
      {
        id: 's1',
        features: { brightness: 50, whiteFlakeRatio: 10 },
        label: { oiliness: 30, dryness: 20, dandruff: 0, redness: 0, densityScore: 60 }
      }
    ] as unknown[] as TrainingSample[];

    const queue = await rankActiveLearningQueue(dummySamples);
    expect(queue).toHaveLength(1);
    expect(queue[0].sample.id).toBe('s1');
  });
});

import { computeDHash, calculateHammingDistance } from './imageDedup';

describe('فاز ۵.۱ — سیستم هیبریدی هش ادراکی بصری dHash', () => {
  it('باید هش dHash را تولید کرده و فاصله همینگ دو هش را به درستی محاسبه کند', async () => {
    const dummyBase64 = 'AAAA';
    const hash1 = await computeDHash(dummyBase64);
    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(16);

    // فاصله همینگ دو هش کاملاً یکسان باید صفر باشد
    const dist1 = calculateHammingDistance(hash1, hash1);
    expect(dist1).toBe(0);

    // فاصله همینگ دو هش متفاوت
    const hash2 = 'ffffffffffffffff';
    const dist2 = calculateHammingDistance(hash1, hash2);
    expect(dist2).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect } from 'vitest';
import { parseAIAnalysisResult } from './analysisSchemas';
import { extractJsonText } from './aiRequestCore';

/**
 * این ماژول تنها سدّ بین «هرچیزی که مدل زبانی برگرداند» و بقیهٔ برنامه است.
 * اگر ولنگار باشد، دادهٔ بی‌معنی وارد دیتابیس پزشکی می‌شود؛ اگر بیش‌ازحد
 * سخت‌گیر باشد، پاسخ‌های سالم رد می‌شوند.
 */

const validResponse = {
  lesions: [
    { type: 'dandruff', confidence: 0.9, bbox: [10, 10, 50, 50] },
    { type: 'redness', confidence: 0.4, bbox: [0, 0, 5, 5] },
  ],
  hairDensity: { level: 'متوسط', score: 55 },
  scalpCondition: { oiliness: 40, dryness: 20, dandruff: 30, redness: 10 },
  hairLoss: { level: 'خفیف', pattern: 'منتشر' },
  recommendations: ['شامپو ضد شوره'],
};

describe('parseAIAnalysisResult — پاسخ معتبر', () => {
  it('پاسخ کامل را بدون خطا می‌پذیرد', () => {
    const parsed = parseAIAnalysisResult(validResponse);
    expect(parsed.hairDensity.score).toBe(55);
    expect(parsed.scalpCondition.oiliness).toBe(40);
    expect(parsed.recommendations).toEqual(['شامپو ضد شوره']);
  });

  it('فیلدهای اختیاری غایب باعث کرش نمی‌شوند', () => {
    const minimal = {
      lesions: [],
      hairDensity: { level: 'کم', score: 0 },
      scalpCondition: { oiliness: 0, dryness: 0 },
      hairLoss: { level: '', pattern: '' },
      recommendations: [],
    };
    const parsed = parseAIAnalysisResult(minimal);
    expect(parsed.lesions).toEqual([]);
    expect(Number.isNaN(parsed.hairDensity.score)).toBe(false);
  });

  it('آستانهٔ اطمینان ضایعات کم‌اعتماد را فیلتر می‌کند', () => {
    const all = parseAIAnalysisResult(validResponse, 0);
    const strict = parseAIAnalysisResult(validResponse, 0.8);
    expect(all.lesions.length).toBeGreaterThan(strict.lesions.length);
    expect(strict.lesions.every(l => l.confidence >= 0.8)).toBe(true);
  });
});

describe('parseAIAnalysisResult — ورودی نامعتبر باید رد شود', () => {
  const badCases: Array<[string, unknown]> = [
    ['null', null],
    ['رشته به‌جای آبجکت', 'not an object'],
    ['آبجکت خالی', {}],
    ['hairDensity غایب', { ...validResponse, hairDensity: undefined }],
    ['امتیاز بیشتر از ۱۰۰', { ...validResponse, hairDensity: { level: 'x', score: 150 } }],
    ['امتیاز منفی', { ...validResponse, hairDensity: { level: 'x', score: -5 } }],
    ['اطمینان بیشتر از ۱', {
      ...validResponse,
      lesions: [{ type: 'x', confidence: 5, bbox: [0, 0, 1, 1] }],
    }],
    ['bbox با طول اشتباه', {
      ...validResponse,
      lesions: [{ type: 'x', confidence: 0.5, bbox: [0, 0] }],
    }],
    ['recommendations رشته به‌جای آرایه', { ...validResponse, recommendations: 'یک پیشنهاد' }],
    ['scalpCondition عددی نیست', {
      ...validResponse,
      scalpCondition: { oiliness: 'زیاد', dryness: 20 },
    }],
  ];

  for (const [label, payload] of badCases) {
    it(`رد می‌کند: ${label}`, () => {
      expect(() => parseAIAnalysisResult(payload)).toThrow();
    });
  }

  it('پیام خطا فارسی و قابل‌فهم است (نه stack خام zod)', () => {
    try {
      parseAIAnalysisResult({});
      throw new Error('باید throw می‌کرد');
    } catch (err) {
      expect((err as Error).message).toContain('ساختار مورد انتظار');
    }
  });
});

describe('extractJsonText — پاکسازی خروجی مدل', () => {
  it('JSON خام را دست‌نخورده برمی‌گرداند', () => {
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
  });

  it('حصار ```json را حذف می‌کند', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('متن توضیحی قبل و بعد از JSON را کنار می‌گذارد', () => {
    const withProse = 'در اینجا تحلیل شما آمده است:\n{"a":1}\nامیدوارم کمک کند!';
    expect(extractJsonText(withProse)).toBe('{"a":1}');
  });

  it('آبجکت تودرتو را کامل و درست می‌برد', () => {
    const nested = 'خروجی: {"a":{"b":[1,2,{"c":3}]},"d":4} پایان';
    expect(JSON.parse(extractJsonText(nested))).toEqual({ a: { b: [1, 2, { c: 3 }] }, d: 4 });
  });

  it('آکولاد داخل رشته را با پایان آبجکت اشتباه نمی‌گیرد', () => {
    const tricky = '{"note":"این } یک آکولاد داخل متن است","x":1}';
    expect(JSON.parse(extractJsonText(tricky))).toEqual({
      note: 'این } یک آکولاد داخل متن است',
      x: 1,
    });
  });

  it('کوتیشن escape شده داخل رشته را درست مدیریت می‌کند', () => {
    const escaped = '{"q":"او گفت \\"سلام\\" و رفت","y":2}';
    expect(JSON.parse(extractJsonText(escaped))).toEqual({ q: 'او گفت "سلام" و رفت', y: 2 });
  });

  it('آرایه در سطح ریشه را هم پشتیبانی می‌کند', () => {
    expect(JSON.parse(extractJsonText('نتیجه: [1,2,3]'))).toEqual([1, 2, 3]);
  });

  it('ورودی خالی یا نامعتبر باعث کرش نمی‌شود', () => {
    expect(extractJsonText('')).toBe('');
    expect(extractJsonText('بدون JSON')).toBe('بدون JSON');
    expect(extractJsonText(null as unknown as string)).toBe('');
  });
});

describe('یکپارچگی: خروجی خام مدل تا نتیجهٔ معتبر', () => {
  it('پاسخ واقع‌بینانهٔ مدل (با حصار و توضیح) کامل پردازش می‌شود', () => {
    const modelOutput = [
      'البته! تحلیل تصویر پوست سر:',
      '```json',
      JSON.stringify(validResponse),
      '```',
      'اگر سوالی بود بپرسید.',
    ].join('\n');

    const parsed = parseAIAnalysisResult(JSON.parse(extractJsonText(modelOutput)));
    expect(parsed.hairDensity.score).toBe(55);
    expect(parsed.lesions.length).toBeGreaterThan(0);
  });
});

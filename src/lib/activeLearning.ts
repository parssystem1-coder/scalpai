/**
 * activeLearning.ts — فاز ۵٫۱
 *
 * پیاده‌سازی یادگیری فعال (Active Learning).
 * صف یادگیری فعال تصاویر بدون برچسب را بر اساس میزان عدم‌قطعیت بالینی (Uncertainty)
 * گزارش‌شده توسط مدل محلی (خروجی فرآیند MC-Dropout در فاز ۳) مرتب می‌کند
 * تا پزشک در زمان برچسب‌گذاری روی «باارزش‌ترین نمونه‌ها» تمرکز کند.
 */

import { TrainingSample } from '../db/types';
import { predictWithLocalModel } from './localModel';

export interface ActiveLearningItem {
  sample: TrainingSample;
  uncertainty: number;
}

/**
 * رتبه‌بندی نمونه‌های بدون برچسب بر اساس بالاترین عدم‌قطعیت (انتروپی پیش‌بینی).
 * نمونه‌های با عدم‌قطعیت بالاتر ارزش برچسب‌گذاری بیشتری دارند.
 */
export async function rankActiveLearningQueue(
  unlabeledSamples: TrainingSample[]
): Promise<ActiveLearningItem[]> {
  const queue: ActiveLearningItem[] = [];

  for (const sample of unlabeledSamples) {
    try {
      const pred = await predictWithLocalModel(sample.features, sample.questionnaireFeatures);
      const uncertainty = pred?.uncertainty ?? 0.5; // fallback به عدم قطعیت متوسط در صورت نبود پیش‌بینی
      queue.push({
        sample,
        uncertainty
      });
    } catch {
      queue.push({
        sample,
        uncertainty: 0.5
      });
    }
  }

  // مرتب‌سازی نزولی (بیشترین عدم‌قطعیت ابتدا قرار می‌گیرد)
  return queue.sort((a, b) => b.uncertainty - a.uncertainty);
}

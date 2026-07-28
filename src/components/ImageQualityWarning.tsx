/**
 * ImageQualityWarning — فاز ۱: هشدار غیرمسدودکننده وقتی کیفیت تصویر ورودی
 * (تار/کم‌نور/پرنور/کم‌کنتراست) پایین است. تحلیل را متوقف نمی‌کند — فقط
 * به کاربر می‌گوید نتیجه ممکن است کمتر قابل‌اعتماد باشد.
 */
import { AlertTriangle } from 'lucide-react';
import type { OfflineAnalysisResult } from '../db';
import { usePick } from '../i18n';

type ImageQuality = NonNullable<OfflineAnalysisResult['imageQuality']>;

interface Props {
  quality: ImageQuality | null | undefined;
  compact?: boolean;
}

export default function ImageQualityWarning({ quality, compact = false }: Props) {
  const pick = usePick();
  if (!quality || !quality.hasIssue) return null;

  const reasons: string[] = [];
  if (quality.isBlurry) reasons.push(pick('تار بودن تصویر', 'blurry image'));
  if (quality.isTooDark) reasons.push(pick('نور بسیار کم', 'very low light'));
  if (quality.isTooBright) reasons.push(pick('نور/فلش بسیار زیاد', 'overexposed/too bright'));
  if (quality.isLowContrast) reasons.push(pick('کنتراست بسیار پایین', 'very low contrast'));

  return (
    <div className={`flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 ${compact ? 'p-3' : 'p-4'}`}>
      <AlertTriangle className="flex-shrink-0 text-orange-400" size={compact ? 18 : 22} />
      <div className="text-sm text-orange-200/90">
        <p className="font-medium text-orange-300">
          {pick('کیفیت تصویر ورودی پایین است', 'Low input image quality')}
        </p>
        <p className="mt-1 opacity-90">
          {pick(
            `مشکل تشخیص‌داده‌شده: ${reasons.join('، ')}. نتیجهٔ تحلیل روی این عکس ممکن است کمتر قابل‌اعتماد باشد؛ در صورت امکان با نور یکنواخت‌تر و فوکوس بهتر دوباره عکس بگیرید.`,
            `Detected issue: ${reasons.join(', ')}. The analysis result for this photo may be less reliable; if possible, retake it with even lighting and better focus.`,
          )}
        </p>
      </div>
    </div>
  );
}

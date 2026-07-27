import { AlertTriangle } from 'lucide-react';

interface Props {
  isRtl: boolean;
  compact?: boolean;
}

export default function MedicalDisclaimer({ isRtl, compact = false }: Props) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 ${compact ? 'p-3' : 'p-4'}`}>
      <AlertTriangle className="flex-shrink-0 text-amber-400" size={compact ? 18 : 22} />
      <div className="text-sm text-amber-200/90">
        <p className="font-medium text-amber-300">
          {isRtl ? 'سلب مسئولیت پزشکی' : 'Medical Disclaimer'}
        </p>
        <p className="mt-1 opacity-90">
          {isRtl
            ? 'نتایج تحلیل (هوش مصنوعی یا آفلاین) صرفاً جنبه راهنمایی دارند و جایگزین تشخیص پزشک یا تریکولوژیست نیستند. برای تصمیم درمانی حتماً با متخصص مشورت کنید.'
            : 'Analysis results (AI or offline) are for guidance only and do not replace professional medical or trichology diagnosis. Always consult a specialist for treatment decisions.'}
        </p>
      </div>
    </div>
  );
}

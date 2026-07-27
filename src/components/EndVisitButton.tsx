/**
 * دکمهٔ صریح «پایان مراجعه» — تنها راه بستن نوبت از جریان‌های تحلیل
 * (به‌جز ذخیرهٔ دستی نهایی تریکولوژیست).
 */
import { CheckCircle2, Loader } from 'lucide-react';

interface Props {
  visible: boolean;
  busy?: boolean;
  label: string;
  hint?: string;
  onEnd: () => void | Promise<void>;
}

export default function EndVisitButton({ visible, busy, label, hint, onEnd }: Props) {
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 space-y-2">
      {hint && <p className="text-xs opacity-70 leading-relaxed">{hint}</p>}
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void onEnd()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium transition"
      >
        {busy ? <Loader size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {label}
      </button>
    </div>
  );
}

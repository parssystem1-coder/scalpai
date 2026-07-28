import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Cpu, Sparkles } from 'lucide-react';

interface Props {
  analyzing: boolean;
  mode: 'offline' | 'online';
  isRtl: boolean;
}

/** A focused analysis state shared by online and offline analysis flows. */
export default function AIAnalysisOverlay({ analyzing, mode, isRtl }: Props) {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (analyzing) {
      startedAt.current = Date.now();
      visibleRef.current = true;
      setVisible(true);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      return;
    }

    if (!visibleRef.current) return;
    if (mode === 'online') {
      visibleRef.current = false;
      setVisible(false);
      return;
    }

    const remaining = Math.max(0, 5000 - (Date.now() - startedAt.current));
    timer.current = window.setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
    }, remaining);
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [analyzing, mode]);

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[2147483645] flex items-center justify-center overflow-hidden bg-[#020617]/95 backdrop-blur-md text-white">
      <div className="ai-analysis-overlay__grid absolute inset-0" />
      <div className="ai-analysis-overlay__scan absolute inset-x-0 top-0 h-px" />
      <div className="relative flex w-full max-w-lg flex-col items-center gap-6 px-6 text-center">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className="ai-analysis-overlay__ring absolute inset-0 rounded-full border border-cyan-300/30" />
          <div className="ai-analysis-overlay__ring ai-analysis-overlay__ring--two absolute inset-5 rounded-full border border-emerald-300/30" />
          <div className="ai-analysis-overlay__core flex h-24 w-24 items-center justify-center rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-400/20 via-cyan-400/15 to-fuchsia-400/20 shadow-[0_0_45px_rgba(45,212,191,.35)]">
            <BrainCircuit size={48} strokeWidth={1.2} className="text-emerald-200" />
          </div>
          <span className="absolute left-1/2 top-0 text-cyan-200"><Sparkles size={16} /></span>
          <span className="absolute bottom-2 right-4 text-emerald-200"><Cpu size={14} /></span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-wide">{isRtl ? 'در حال تحلیل هوشمند' : 'AI analysis in progress'}</h2>
          <p className="text-sm text-cyan-100/70">{mode === 'offline' ? (isRtl ? 'استخراج ویژگی‌ها و بررسی الگوهای پوست سر...' : 'Extracting features and reading scalp patterns...') : (isRtl ? 'مدل هوش مصنوعی در حال بررسی تصویر است...' : 'The AI model is examining the image...')}</p>
        </div>
        <div className="flex items-center gap-1.5" aria-label="Analysis progress">
          {[0, 1, 2, 3, 4].map(index => <span key={index} className="ai-analysis-overlay__dot h-2 w-2 rounded-full bg-emerald-300" style={{ animationDelay: `${index * 140}ms` }} />)}
        </div>
      </div>
    </div>
  );
}

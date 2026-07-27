import { useEffect, useRef } from 'react';
import { BrainCircuit, LockKeyhole } from 'lucide-react';

interface Props {
  isRtl: boolean;
  onWake: () => void;
}

/** Full-screen idle state: deliberately uses a neutral AI-console visual,
 * independent of the selected application theme. */
export default function AIScreenSaver({ isRtl, onWake }: Props) {
  const wakeRef = useRef(onWake);
  useEffect(() => { wakeRef.current = onWake; }, [onWake]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      event.preventDefault();
      wakeRef.current();
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, []);

  return (
    <div
      className="ai-screensaver fixed inset-0 z-[2147483646] flex items-center justify-center overflow-hidden bg-[#020607] text-white"
      onPointerDown={onWake}
      onWheel={onWake}
      onTouchStart={onWake}
      role="presentation"
    >
      <div className="ai-screensaver__grid absolute inset-0" />
      <div className="ai-screensaver__scanline absolute inset-x-0 top-0 h-px" />
      <div className="ai-screensaver__ambient ai-screensaver__ambient--a absolute -start-40 top-1/4 h-96 w-96 rounded-full" />
      <div className="ai-screensaver__ambient ai-screensaver__ambient--b absolute -end-40 bottom-1/4 h-96 w-96 rounded-full" />

      <div className="relative flex w-full max-w-4xl flex-col items-center gap-8 px-6 py-10 text-center">
        <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.45em] text-emerald-300/80">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_14px_#6ee7b7]" />
          SCALPAI · NEURAL SCAN
        </div>

        <div className="ai-screensaver__core relative h-64 w-64 sm:h-80 sm:w-80">
          <div className="ai-screensaver__orbit ai-screensaver__orbit--outer absolute inset-0 rounded-full border border-cyan-300/20" />
          <div className="ai-screensaver__orbit ai-screensaver__orbit--middle absolute inset-7 rounded-full border border-emerald-300/25" />
          <div className="ai-screensaver__orbit ai-screensaver__orbit--inner absolute inset-14 rounded-full border border-cyan-300/20" />
          <div className="ai-screensaver__node ai-screensaver__node--one absolute left-1/2 top-0 h-2 w-2 rounded-full bg-cyan-200" />
          <div className="ai-screensaver__node ai-screensaver__node--two absolute bottom-7 right-4 h-2 w-2 rounded-full bg-emerald-200" />
          <div className="ai-screensaver__node ai-screensaver__node--three absolute bottom-10 left-5 h-2 w-2 rounded-full bg-fuchsia-200" />
          <div className="ai-screensaver__brain absolute inset-20 flex items-center justify-center rounded-[42%] border border-emerald-200/45 bg-gradient-to-br from-emerald-300/15 via-cyan-300/10 to-fuchsia-400/15 shadow-[0_0_55px_rgba(45,212,191,.3)]">
            <BrainCircuit size={72} strokeWidth={1.1} className="text-emerald-200 drop-shadow-[0_0_14px_rgba(110,231,183,.85)]" />
          </div>
          <div className="ai-screensaver__radar absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-[0.18em] text-emerald-100 sm:text-4xl">SCALP INTELLIGENCE</h1>
          <p className="text-sm tracking-wide text-cyan-100/70 sm:text-base">
            {isRtl ? 'سامانهٔ هوشمند تحلیل پوست سر' : 'Intelligent scalp analysis system'}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-xs text-white/55">
          <LockKeyhole size={14} className="text-emerald-300" />
          {isRtl ? 'برای ادامه، یک کلید بزنید یا صفحه را لمس کنید' : 'Press any key or touch the screen to continue'}
        </div>
      </div>
    </div>
  );
}

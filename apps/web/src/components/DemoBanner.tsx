import React from "react";
import { X } from "lucide-react";

interface DemoBannerProps {
  onUpgrade: () => void;
  onExit: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onUpgrade, onExit }) => {
  return (
    <aside
      aria-label="Demo Mode Notification"
      className="fixed top-0 inset-x-0 z-[1000] bg-gradient-to-r from-[oklch(30%_0.04_15/0.95)] to-[oklch(24%_0.05_18/0.98)] text-white px-8 py-3.5 flex flex-col md:flex-row items-center justify-between border-b border-[oklch(85%_0.12_55/0.5)] shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center gap-3.5 text-right font-sans mb-2 md:mb-0" dir="rtl">
        <span className="bg-[oklch(82%_0.14_58)] text-[oklch(20%_0.02_20)] text-[0.7rem] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
          حالت پیش‌نمایش UI (Read-Only)
        </span>
        <p className="text-sm font-normal text-[oklch(95%_0.01_30)]">
          شما در حال مشاهده پیش‌نمایش محیط نرم‌افزار هستید. برای فعال‌سازی کامل ابزارها، تحلیل فولیکول و خدمات، لطفاً اشتراک خود را فعال کنید.
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onUpgrade}
          className="bg-gradient-to-r from-[oklch(76%_0.085_24)] to-[oklch(62%_0.09_16)] hover:brightness-110 text-white font-semibold text-xs px-5 py-2 rounded-full shadow-lg transition-transform active:scale-95"
        >
          خرید / ارتقای اشتراک Pro
        </button>
        <button
          onClick={onExit}
          className="text-xs text-[oklch(80%_0.02_30)] border border-white/20 hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          خروج از دمو
        </button>
      </div>
    </aside>
  );
};

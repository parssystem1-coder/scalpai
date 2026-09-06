import React from "react";

interface ProPlansViewProps {
  onSelectPlan: () => void;
}

export const ProPlansView: React.FC<ProPlansViewProps> = ({ onSelectPlan }) => {
  return (
    <div className="animate-fadeIn">
      <h1 className="font-serif text-3xl font-normal mb-1">Pro Suite Value</h1>
      <p className="text-xs font-light text-[oklch(42%_0.02_20)] mb-4">
        امکانات کامل آزمایشگاهی و درمانی برای افزایش رضایت کلاینت‌ها و درآمد سالن
      </p>

      <div className="flex items-baseline justify-between p-3 rounded-2xl bg-gradient-to-r from-[oklch(85%_0.12_55/0.2)] to-[oklch(76%_0.085_24/0.15)] border border-[oklch(85%_0.12_55/0.4)] mb-3.5">
        <span className="text-xs font-semibold text-[oklch(20%_0.02_20)]">Trichology Pro Full License</span>
        <span className="font-serif text-xl font-bold text-[oklch(62%_0.09_16)]">$39 / month</span>
      </div>

      <div className="space-y-2.5 mb-5" dir="rtl">
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/40 border border-white/60">
          <div className="w-6 h-6 rounded-full bg-[oklch(62%_0.09_16/0.15)] text-[oklch(62%_0.09_16)] grid place-items-center font-bold text-xs shrink-0">
            ۱
          </div>
          <div>
            <strong className="text-xs block text-[oklch(20%_0.02_20)]">Bespoke Formulation Generator</strong>
            <p className="text-[0.7rem] text-[oklch(42%_0.02_20)] mt-0.5 leading-relaxed">
              تولید فرمولاسیون و دوزهای اختصاصی سرم و لایه‌بردار متناسب با تیپ اسکالپ هر کلاینت.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/40 border border-white/60">
          <div className="w-6 h-6 rounded-full bg-[oklch(62%_0.09_16/0.15)] text-[oklch(62%_0.09_16)] grid place-items-center font-bold text-xs shrink-0">
            ۲
          </div>
          <div>
            <strong className="text-xs block text-[oklch(20%_0.02_20)]">Follicle Microscopic AI Scanner</strong>
            <p className="text-[0.7rem] text-[oklch(42%_0.02_20)] mt-0.5 leading-relaxed">
              دسترسی نامحدود به لنز اسکن میکروسکوپی کورتکس و کوتیکول مو همراه با گزارش خودکار.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/40 border border-white/60">
          <div className="w-6 h-6 rounded-full bg-[oklch(62%_0.09_16/0.15)] text-[oklch(62%_0.09_16)] grid place-items-center font-bold text-xs shrink-0">
            ۳
          </div>
          <div>
            <strong className="text-xs block text-[oklch(20%_0.02_20)]">Digital Client Dossier & Growth Tracker</strong>
            <p className="text-[0.7rem] text-[oklch(42%_0.02_20)] mt-0.5 leading-relaxed">
              پرونده ابری درمان مراجعین با ثبت تاریخچه جلسات اسکراب و نمودار رشد تراکم مو.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelectPlan}
        className="w-full h-12 rounded-2xl bg-gradient-to-r from-[oklch(76%_0.085_24)] via-[oklch(62%_0.09_16)] to-[oklch(48%_0.095_12)] text-white font-semibold text-xs tracking-wider uppercase shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
      >
        Activate Full Pro Subscription
      </button>
    </div>
  );
};

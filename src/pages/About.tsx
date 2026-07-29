import { Heart, Globe, Mail, Phone, MapPin, Brain, Cpu, ShieldCheck, Layers, Sparkles } from 'lucide-react';
import { useSettingsStore } from '../store';

export default function About() {
  const { settings } = useSettingsStore();
  const isRtl = settings.language === 'fa';

  const engineFeatures = [
    {
      icon: Cpu,
      title: isRtl ? 'پردازش تصویر هوشمند' : 'Intelligent Image Processing',
      desc: isRtl 
        ? 'سگمنتیشن Otsu بر روی کانال اشباع پوست سر به همراه CLAHE و کالیبراسیون لنز جهت حذف اثر تداخل مو بر روی محاسبات قرمزی و شوره.' 
        : 'Otsu segmentation on saturation channel with CLAHE and lens calibration to eliminate hair interference on redness and dandruff.',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    },
    {
      icon: Brain,
      title: isRtl ? 'هوش مصنوعی محلی پایدار' : 'Stable Local Machine Learning',
      desc: isRtl 
        ? 'مدل محلی مجهز به ساختار Focal Loss جهت مهار عدم توازن کلاس‌های پزشکی و کالیبراسیون دما (Temperature Scaling) برای ارتقای ECE.' 
        : 'Local model equipped with Focal Loss to handle clinical class imbalance and Temperature Scaling to optimize ECE.',
      color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20'
    },
    {
      icon: ShieldCheck,
      title: isRtl ? 'سنجش عدم‌قطعیت بالینی' : 'Clinical Uncertainty Assessment',
      desc: isRtl 
        ? 'سیستم MC-Dropout (ده بار پیش‌بینی تصادفی ناهمگام) برای تخمین انحراف‌معیار خطای بالینی و ارائه نمرهٔ شک بالینی به پزشک.' 
        : 'MC-Dropout system (10x randomized inference) to estimate clinical standard deviation and provide uncertainty score to physicians.',
      color: 'text-emerald-400 bg-green-500/10 border-green-500/20'
    },
    {
      icon: Layers,
      title: isRtl ? 'پایش داده‌های خارج از توزیع (OOD)' : 'Out-of-Distribution Monitoring',
      desc: isRtl 
        ? 'محاسبهٔ فاصلهٔ ماهالانوبیس منظم‌شده بر روی ویژگی‌های Heuristic جهت صید و هشدار در مواجهه با ورودی‌های کاملاً غیرپزشکی.' 
        : 'Regularized Mahalanobis Distance computed on heuristic features to detect and warn against non-clinical inputs.',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    },
    {
      icon: Sparkles,
      title: isRtl ? 'سیستم هیبریدی ضدتکرار بصری' : 'Hybrid Perceptual Deduplication',
      desc: isRtl 
        ? 'تلفیق هش باینری فوق‌سریع نمونه‌برداری با الگوریتم dHash و فاصلهٔ همینگ جهت شناسایی دوقلوهای بصری فشرده یا ریسایز شده.' 
        : 'Combining sub-millisecond binary hash with perceptual dHash and Hamming distance to eliminate compressed or resized twins.',
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Hero */}
      <div className="text-center py-12 relative overflow-hidden rounded-3xl bg-white/[0.02] border border-white/5 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg hover:scale-105 transition duration-300">
          <span className="text-4xl font-bold text-white tracking-wider">S</span>
        </div>
        <h1 className="text-4.5xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent tracking-tight">
          ScalpAI
        </h1>
        <p className="text-xl opacity-85 font-medium">
          {isRtl ? 'سیستم هوشمند چندوجهی تحلیل اسکالپ و مدیریت کلینیک' : 'Multimodal Scalp Analysis & Clinic Management System'}
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-semibold">Engine v2.2.0-beta</span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">TF.js Local ML</span>
        </div>
      </div>

      {/* Advanced Core Engine */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2 border-b border-white/10 pb-3">
          <Cpu className="text-blue-400" size={24} />
          <span>{isRtl ? 'موتور پیشرفتهٔ بالینی و ریاضی' : 'Advanced Clinical & Math Engine'}</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {engineFeatures.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div key={idx} className={`rounded-2xl border p-6 space-y-3 bg-white/[0.01] backdrop-blur transition hover:bg-white/[0.03] ${f.color}`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-current/10">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-bold text-base text-white">{f.title}</h3>
                </div>
                <p className="text-sm opacity-70 leading-relaxed text-slate-200">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* About the Software */}
      <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-8 space-y-4 shadow-xl">
        <h2 className="text-2xl font-bold flex items-center gap-2 border-b border-white/10 pb-3">
          <Globe className="text-purple-400" size={24} />
          <span>{isRtl ? 'معرفی پلتفرم و معماری' : 'Platform & Architecture Overview'}</span>
        </h2>
        <p className="leading-relaxed opacity-80 text-sm sm:text-base text-slate-300">
          {isRtl
            ? 'ScalpAI یک پلتفرم تشخیصی مدرن و تخصصی برای مراکز کلینیکی، زیبایی و تریکولوژی پوست و مو است. این نرم‌افزار به صورت هیبریدی (مرورگر و فرآیند دسکتاپ بومی) توسعه یافته است و به متخصصان این امکان را می‌دهد تا تحلیل‌های آفلاین رنگ/بافت پوست سر را همراه با ارزیابی‌های پیشرفتهٔ یادگیری ماشین محلی به بیماران ارائه دهند. سیستم مجهز به پایش رانش آماری داده‌ها، یادگیری فعال و کالیبراسیون هوشمند سلب مسئولیت‌های حقوقی است.'
            : 'ScalpAI is a modern and specialized diagnostic platform for clinical, aesthetic, and scalp/hair trichology centers. Developed as a hybrid system (Vite web and native desktop processes), it enables specialists to perform precise offline color/texture scalp analysis along with highly-calibrated local machine learning predictions. The platform is continuously monitored for statistical data drift and implements active learning queues.'}
        </p>
      </div>

      {/* Contact */}
      <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-8 shadow-xl">
        <h2 className="text-2xl font-bold flex items-center gap-2 border-b border-white/10 pb-3 mb-6">
          <Mail className="text-indigo-400" size={24} />
          <span>{isRtl ? 'تماس با پشتیبانی و تیم توسعه' : 'Contact Support & Team'}</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Mail className="text-blue-400" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs opacity-50 font-medium">{isRtl ? 'پست الکترونیک' : 'Email'}</p>
              <p className="font-semibold text-sm truncate">parssystem1@gmail.com</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Phone className="text-emerald-400" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs opacity-50 font-medium">{isRtl ? 'تلفن تماس' : 'Phone'}</p>
              <p className="font-semibold text-sm" dir="ltr">09171940289</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
              <MapPin className="text-purple-400" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs opacity-50 font-medium">{isRtl ? 'موقعیت دفتر' : 'Address'}</p>
              <p className="font-semibold text-sm truncate">{isRtl ? 'شیراز، ایران' : 'Shiraz, Iran'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Credits */}
      <div className="rounded-3xl border border-indigo-400/20 bg-gradient-to-b from-indigo-500/10 to-white/[0.02] px-6 py-8 text-center shadow-xl">
        <p className="text-base sm:text-lg text-slate-200">
          {isRtl ? 'طراحی و توسعه با عشق و دقت بالینی توسط' : 'Designed & developed with clinical precision by'}{' '}
          <Heart className="inline-block align-middle text-rose-400 fill-rose-500/30 mx-1 animate-pulse" size={18} />{' '}
          <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300">
            {isRtl ? 'مهندس سعید عباسی' : 'Eng. Saeed Abbasi'}
          </span>
        </p>
        <div className="mx-auto mt-4 mb-3 h-px w-24 bg-gradient-to-r from-transparent via-indigo-400/35 to-transparent" />
        <p className="text-xs tracking-wider text-slate-400">
          &copy; 2026 <span className="font-semibold text-slate-300">ScalpAI</span>.{' '}
          {isRtl ? 'تمامی حقوق مادی و معنوی محفوظ است.' : 'All rights reserved.'}
        </p>
      </div>
    </div>
  );
}

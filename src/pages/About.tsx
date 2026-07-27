import { Heart, Code, Globe, Mail, Phone, MapPin } from 'lucide-react';
import { useSettingsStore } from '../store';

export default function About() {
  const { settings } = useSettingsStore();
  const isRtl = settings.language === 'fa';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Hero */}
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
          <span className="text-4xl font-bold text-white">S</span>
        </div>
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          ScalpAI
        </h1>
        <p className="text-xl opacity-70">
          {isRtl ? 'سیستم تحلیل اسکالپ و مدیریت مشتریان' : 'Scalp Analysis & Client Management System'}
        </p>
        <p className="text-sm opacity-50 mt-2">v1.0.0</p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Code className="text-blue-400" size={24} />
          </div>
          <h3 className="font-semibold mb-2">{isRtl ? 'تکنولوژی پیشرفته' : 'Advanced Technology'}</h3>
          <p className="text-sm opacity-70">
            {isRtl ? 'ساخته شده با React، TypeScript و هوش مصنوعی' : 'Built with React, TypeScript & AI'}
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Heart className="text-purple-400" size={24} />
          </div>
          <h3 className="font-semibold mb-2">{isRtl ? 'طراحی کاربرپسند' : 'User-Friendly Design'}</h3>
          <p className="text-sm opacity-70">
            {isRtl ? 'رابط کاربری زیبا و آسان' : 'Beautiful & intuitive interface'}
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Globe className="text-green-400" size={24} />
          </div>
          <h3 className="font-semibold mb-2">{isRtl ? 'چند زبانه' : 'Multi-Language'}</h3>
          <p className="text-sm opacity-70">
            {isRtl ? 'پشتیبانی از فارسی و انگلیسی' : 'Persian & English support'}
          </p>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8">
        <h2 className="text-2xl font-semibold mb-4">{isRtl ? 'درباره نرم‌افزار' : 'About the Software'}</h2>
        <p className="leading-relaxed opacity-80">
          {isRtl
            ? 'ScalpAI یک نرم‌افزار حرفه‌ای برای مراکز کلینیکی، زیبایی و تریکولوژی است که امکان تحلیل دقیق پوست سر، مدیریت مشتریان و ارائه خدمات تخصصی را فراهم می‌کند. این نرم‌افزار با استفاده از هوش مصنوعی، تحلیل‌های پیشرفته‌ای از وضعیت پوست سر و مو ارائه می‌دهد و به متخصصان کمک می‌کند تا بهترین راهکارهای درمانی را پیشنهاد دهند.'
            : 'ScalpAI is a professional software for clinical, beauty, and trichology centers that enables precise scalp analysis, client management, and specialized services. Using artificial intelligence, this software provides advanced analysis of scalp and hair conditions, helping specialists recommend the best treatment solutions.'}
        </p>
      </div>

      {/* Contact */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8">
        <h2 className="text-2xl font-semibold mb-6">{isRtl ? 'تماس با ما' : 'Contact Us'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Mail className="text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-sm opacity-50">{isRtl ? 'ایمیل' : 'Email'}</p>
              <p>parssystem1@gmail.com</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Phone className="text-green-400" size={24} />
            </div>
            <div>
              <p className="text-sm opacity-50">{isRtl ? 'تلفن' : 'Phone'}</p>
              <p dir="ltr">09171940289</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <MapPin className="text-purple-400" size={24} />
            </div>
            <div>
              <p className="text-sm opacity-50">{isRtl ? 'آدرس' : 'Address'}</p>
              <p>{isRtl ? 'شیراز، ایران' : 'Shiraz, Iran'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="rounded-2xl border border-blue-400/25 bg-gradient-to-b from-blue-500/10 to-white/[0.03] px-6 py-8 text-center">
        <p className="text-base sm:text-lg text-slate-200/90">
          {isRtl ? 'طراحی و توسعه با' : 'Designed & developed with'}{' '}
          <Heart className="inline-block align-middle text-rose-400 fill-rose-400/30 mx-1" size={18} />{' '}
          {isRtl ? 'توسط' : 'by'}{' '}
          <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-blue-400">
            {isRtl ? 'مهندس سعید عباسی' : 'Eng. Saeed Abbasi'}
          </span>
        </p>
        <div className="mx-auto mt-4 mb-3 h-px w-24 bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
        <p className="text-sm tracking-wide text-slate-400">
          &copy; 2024 <span className="font-medium text-slate-300">ScalpAI</span>.{' '}
          {isRtl ? 'تمامی حقوق محفوظ است.' : 'All rights reserved.'}
        </p>
      </div>
    </div>
  );
}

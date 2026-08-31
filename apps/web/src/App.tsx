import React, { useState, useEffect } from "react";
import { Volume2, VolumeX, Sparkles, Activity, Check } from "lucide-react";
import { TabMode, MoleculeInfo } from "./types.js";
import { DemoBanner } from "./components/DemoBanner.js";
import { HairCanvas } from "./components/HairCanvas.js";
import { AmberOrbs } from "./components/AmberOrbs.js";
import { SignInForm } from "./components/SignInForm.js";
import { RegisterForm } from "./components/RegisterForm.js";
import { ProPlansView } from "./components/ProPlansView.js";

const MOLECULES: MoleculeInfo[] = [
  {
    name: "Keratin Microfibrils",
    formula: "Polypeptide Matrix",
    desc: "ماتریس پروتئینی کورتکس با فیلامنت‌های مارپیچی سه‌گانه جهت تقویت کشسانی ساقه مو.",
    badge: "Cortex Matrix"
  },
  {
    name: "Ceramide-3 Barrier",
    formula: "C34H66NO3",
    desc: "سیمان لیپیدی بین‌سلولی کوتیکول مو جهت مهر و موم لایه‌های شاخی و جلوگیری از خروج رطوبت.",
    badge: "Lipid Shield"
  },
  {
    name: "Zinc Pyrithione Complex",
    formula: "C10H8N2O2S2Zn",
    desc: "کوفاکتور لایه‌بردار بیواکتیو جهت پاکسازی میکروآلودگی‌های تجمع‌یافته در روزنه فولیکول.",
    badge: "Cellular Detox"
  },
  {
    name: "Copper Tripeptide-1",
    formula: "GHK-Cu Complex",
    desc: "پپتید سیگنال‌دهنده محرک گردش خون مویرگی در پاپیلای پوستی برای رشد مجدد و تغذیه ریشه.",
    badge: "Bulb Genesis"
  }
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabMode>("signin");
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannerActive, setScannerActive] = useState(true);
  const [scannerData, setScannerData] = useState("SCANNING CORTEX...");
  const [scannerPos, setScannerPos] = useState({ x: 0, y: 0, visible: false });
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null);
  const [currentMolIndex, setCurrentMolIndex] = useState(0);

  const showToast = (title: string, desc: string) => {
    setToast({ title, desc });
    setTimeout(() => setToast(null), 3800);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMolIndex(prev => (prev + 1) % MOLECULES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!scannerActive || e.clientX < window.innerWidth * 0.45 || e.clientY < 75) {
      setScannerPos(prev => ({ ...prev, visible: false }));
      return;
    }
    setScannerPos({ x: e.clientX, y: e.clientY, visible: true });
    if (e.clientY > window.innerHeight * 0.68) {
      setScannerData("DERMAL PAPILLA [98.4% CELLULAR PURITY]");
    } else if (e.clientY > window.innerHeight * 0.44) {
      setScannerData("EPIDERMIS LIPID MATRIX [HYDRATED]");
    } else {
      setScannerData("KERATIN CORTEX FIBER [DIAMETER: 78µm]");
    }
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="relative min-h-screen overflow-x-hidden bg-[oklch(85%_0.03_28)] font-sans antialiased text-[oklch(20%_0.02_20)]"
    >
      {/* 1. Global Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04]"
        style={{ backgroundImage: `url('/images/scalp-bg.jpg')` }}
      />

      {/* 2. Floating Amber Serum Spheres */}
      <AmberOrbs />

      {/* 3. Interactive Hair Canvas */}
      <HairCanvas />

      {/* 4. Scanner Reticle HUD */}
      <div
        className={`fixed z-[100] w-36 h-36 rounded-full border border-dashed border-[oklch(80%_0.14_195/0.7)] shadow-[0_0_25px_oklch(80%_0.14_195/0.3),inset_0_0_15px_oklch(80%_0.14_195/0.2)] pointer-events-none transition-all duration-300 -translate-x-1/2 -translate-y-1/2 ${
          scannerPos.visible ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}
        style={{ left: `${scannerPos.x}px`, top: `${scannerPos.y}px` }}
      >
        <div className="absolute inset-2.5 rounded-full border border-[oklch(85%_0.12_55/0.6)] border-l-transparent animate-spin" />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[oklch(15%_0.02_20/0.9)] text-[oklch(84%_0.14_195)] px-2 py-0.5 rounded-md text-[0.6rem] font-bold tracking-wider uppercase whitespace-nowrap border border-[oklch(80%_0.14_195/0.4)]">
          {scannerData}
        </div>
      </div>

      {/* 5. Demo Notification Banner */}
      {isDemoActive && (
        <DemoBanner
          onUpgrade={() => {
            setIsDemoActive(false);
            setActiveTab("plans");
          }}
          onExit={() => setIsDemoActive(false)}
        />
      )}

      {/* 6. Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 backdrop-blur-md bg-[oklch(98%_0.01_28/0.18)] border-b border-white/20">
        <a href="#home" className="flex items-center gap-3 text-inherit no-underline">
          <div className="w-9 h-9 rounded-full border border-[oklch(62%_0.09_16/0.4)] grid place-items-center bg-white/30 shadow-md">
            <Sparkles className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
          </div>
          <span className="font-serif font-semibold text-lg tracking-[0.18em] uppercase">SCALP SCRUB</span>
        </a>

        <nav className="hidden lg:flex gap-8 list-none">
          {["Pro Suite", "Cellular Science", "Subscription Plans", "For Hair Experts"].map(item => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-xs tracking-[0.15em] uppercase font-medium text-[oklch(20%_0.02_20)] hover:text-[oklch(62%_0.09_16)] transition-colors"
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setScannerActive(!scannerActive)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[0.72rem] tracking-wider uppercase font-semibold border border-white/40 backdrop-blur-sm transition-all ${
              scannerActive ? "bg-white/70 border-[oklch(62%_0.09_16)] shadow-md" : "bg-white/20"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[oklch(62%_0.09_16)] animate-pulse" />
            <span className="hidden sm:inline">{scannerActive ? "Cellular Lens: ON" : "Lens: Standby"}</span>
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.72rem] tracking-wider uppercase font-semibold border border-white/40 bg-white/30 hover:bg-white/50 backdrop-blur-sm transition-all"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{soundEnabled ? "Acoustics" : "Muted"}</span>
          </button>
        </div>
      </header>

      {/* 7. Main Portal Body */}
      <main className="relative z-[5] grid grid-cols-1 lg:grid-cols-[minmax(420px,490px)_1fr] min-h-[calc(100vh-75px)] px-6 md:px-16 py-8 items-center gap-12">
        <div className="w-full">
          <div className="relative w-full p-8 md:p-9 rounded-[28px] bg-[oklch(98%_0.008_28/0.30)] border border-white/70 backdrop-blur-[34px] shadow-[0_32px_90px_oklch(30%_0.04_15/0.18)] overflow-hidden">
            <div className="absolute -inset-[1.5px] rounded-[inherit] p-[1.5px] pointer-events-none bg-gradient-to-tr from-transparent via-[oklch(76%_0.085_24/0.4)] to-[oklch(62%_0.09_16/0.5)] opacity-80" />

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full border border-[oklch(62%_0.09_16/0.4)] grid place-items-center bg-white/40">
                <Sparkles className="w-5 h-5 text-[oklch(62%_0.09_16)]" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold tracking-widest uppercase leading-tight">Scalp Scrub</h3>
                <p className="text-[0.58rem] tracking-widest uppercase text-[oklch(60%_0.015_20)]">Pro Trichology Portal</p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-white/25 rounded-xl border border-white/40 mb-5">
              <button
                onClick={() => setActiveTab("signin")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "signin" ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm" : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setActiveTab("register")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "register" ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm" : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Open Sign Up
              </button>
              <button
                onClick={() => setActiveTab("plans")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "plans" ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm" : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Pro Plans 💎
              </button>
            </div>

            {activeTab === "signin" && (
              <SignInForm
                onSubmit={data => showToast("ورود موفق", `خوش آمدید ${data.username}. در حال اتصال...`)}
                onDemoLogin={provider => {
                  setIsDemoActive(true);
                  showToast("حالت دمو", `شما از طریق ${provider} وارد محیط پیش‌نمایش شدید.`);
                }}
                onForgotPassword={() => showToast("بازیابی رمز", "لینک بازنشانی رمز به ایمیل ارسال شد.")}
              />
            )}

            {activeTab === "register" && (
              <RegisterForm
                onSubmit={data => {
                  showToast("حساب ایجاد شد", `خوش آمدید ${data.fullName}. لطفاً پلن را انتخاب کنید.`);
                  setTimeout(() => setActiveTab("plans"), 1200);
                }}
              />
            )}

            {activeTab === "plans" && (
              <ProPlansView
                onSelectPlan={() => showToast("اتصال به درگاه", "در حال انتقال به صفحه پرداخت امن...")}
              />
            )}
          </div>
        </div>

        {/* Right Side Editorial */}
        <section className="flex flex-col items-end text-right pl-0 lg:pl-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/35 border border-white/60 backdrop-blur-md text-xs font-semibold tracking-widest uppercase text-[oklch(48%_0.095_12)] mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(82%_0.14_58)] animate-pulse" />
            <span>Cellular Trichology Vol. IX</span>
          </div>

          <h2 className="font-serif text-4xl lg:text-6xl font-normal leading-tight tracking-wide uppercase mb-4 text-[oklch(20%_0.02_20)]">
            Healthy Scalp.<br />
            <em className="font-light italic text-[oklch(62%_0.09_16)]">Beautiful You.</em>
          </h2>

          <div className="w-16 h-0.5 bg-gradient-to-r from-transparent to-[oklch(62%_0.09_16)] my-2 mb-4" />

          <p className="text-base font-light leading-relaxed text-[oklch(42%_0.02_20)] max-w-md mb-6">
            مهندسی لایه‌برداری میکروسکوپی بیواکتیو. انحلال آلودگی‌های انباشته در روزنه فولیکول برای ایجاد بستری سالم، شفاف و تنفس‌پذیر جهت رویش حداکثری تار مو.
          </p>

          <div className="w-full max-w-sm p-4 rounded-3xl bg-white/45 border border-white/80 backdrop-blur-xl shadow-lg flex items-center gap-4 text-left transition-all">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[oklch(98%_0.08_60/0.8)] to-[oklch(85%_0.12_50/0.6)] border border-white/90 grid place-items-center shrink-0 shadow-md">
              <Activity className="w-5 h-5 text-[oklch(62%_0.09_16)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-serif text-lg font-semibold text-[oklch(20%_0.02_20)]">{MOLECULES[currentMolIndex].name}</h4>
                <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-[oklch(62%_0.09_16)] text-white uppercase">
                  {MOLECULES[currentMolIndex].badge}
                </span>
              </div>
              <p className="text-xs text-[oklch(42%_0.02_20)] mt-0.5 leading-snug">{MOLECULES[currentMolIndex].desc}</p>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Toast Feedback */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2000] px-6 py-3 rounded-full bg-white/95 border border-[oklch(76%_0.085_24)] shadow-2xl backdrop-blur-xl flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center text-xs font-bold">
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="text-right font-sans" dir="rtl">
            <strong className="block text-xs text-[oklch(20%_0.02_20)]">{toast.title}</strong>
            <span className="text-[0.7rem] text-[oklch(50%_0.015_20)]">{toast.desc}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Volume2, VolumeX, Sparkles, Activity, Microscope, Users } from "lucide-react";
import { TabMode, MoleculeInfo } from "../types.js";
import { DemoBanner } from "../components/DemoBanner.js";
import { HairCanvas } from "../components/HairCanvas.js";
import { AmberOrbs } from "../components/AmberOrbs.js";
import { SignInForm } from "../components/SignInForm.js";
import { RegisterForm } from "../components/RegisterForm.js";
import { ProPlansView } from "../components/ProPlansView.js";
import { toggleLang } from "../i18n.js";

const MOLECULES: MoleculeInfo[] = [
  {
    name: "Keratin Microfibrils",
    formula: "Polypeptide Matrix",
    desc: "ماتریس پروتئینی کورتکس با فیلامنت‌های مارپیچی سه‌گانه جهت تقویت کشسانی ساقه مو.",
    badge: "Cortex Matrix",
  },
  {
    name: "Ceramide-3 Barrier",
    formula: "C34H66NO3",
    desc: "سیمان لیپیدی بین‌سلولی کوتیکول مو جهت مهر و موم لایه‌های شاخی و جلوگیری از خروج رطوبت.",
    badge: "Lipid Shield",
  },
  {
    name: "Zinc Pyrithione Complex",
    formula: "C10H8N2O2S2Zn",
    desc: "کوفاکتور لایه‌بردار بیواکتیو جهت پاکسازی میکروآلودگی‌های تجمع‌یافته در روزنه فولیکول.",
    badge: "Cellular Detox",
  },
];

export interface LandingProps {
  showToast: (title: string, desc: string) => void;
}

export const LandingPage: React.FC<LandingProps> = ({ showToast }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabMode>("signin");
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannerActive] = useState(true);
  const [scannerData, setScannerData] = useState("SCANNING CORTEX...");
  const [scannerPos, setScannerPos] = useState({ x: 0, y: 0, visible: false });
  const [currentMolIndex, setCurrentMolIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMolIndex((prev) => (prev + 1) % MOLECULES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!scannerActive || e.clientX < window.innerWidth * 0.45 || e.clientY < 75) {
      setScannerPos((prev) => ({ ...prev, visible: false }));
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
      {/* Global Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04]"
        style={{ backgroundImage: `url('/images/scalp-bg.jpg')` }}
      />

      {/* Floating Amber Serum Spheres */}
      <AmberOrbs />

      {/* Interactive Hair Canvas */}
      <HairCanvas />

      {/* Scanner Reticle HUD */}
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

      {/* Demo Banner */}
      {isDemoActive && (
        <DemoBanner
          onUpgrade={() => {
            setIsDemoActive(false);
            setActiveTab("plans");
          }}
          onExit={() => setIsDemoActive(false)}
        />
      )}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 backdrop-blur-md bg-[oklch(98%_0.01_28/0.18)] border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full border border-[oklch(62%_0.09_16/0.4)] grid place-items-center bg-white/30 shadow-md">
            <Sparkles className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
          </div>
          <span className="font-serif font-semibold text-lg tracking-[0.18em] uppercase">SCALP SCRUB</span>
        </div>

        <nav className="hidden lg:flex gap-6 list-none items-center">
          <Link
            to="/dashboard"
            className="text-xs tracking-[0.15em] uppercase font-semibold text-[oklch(20%_0.02_20)] hover:text-[oklch(62%_0.09_16)] transition-colors"
          >
            داشبورد تریکولوژی
          </Link>
          <Link
            to="/patients"
            className="text-xs tracking-[0.15em] uppercase font-semibold text-[oklch(20%_0.02_20)] hover:text-[oklch(62%_0.09_16)] transition-colors"
          >
            پرونده بیماران
          </Link>
          <Link
            to="/plans"
            className="text-xs tracking-[0.15em] uppercase font-semibold text-[oklch(20%_0.02_20)] hover:text-[oklch(62%_0.09_16)] transition-colors"
          >
            تعرفه‌ها و اشتراک
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            id="quick-portal-btn"
            to="/login"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.72rem] tracking-wider uppercase font-semibold border border-[oklch(62%_0.09_16/0.6)] bg-white/70 hover:bg-white text-[oklch(50%_0.095_12)] shadow-sm backdrop-blur-sm transition-all"
          >
            <Microscope className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
            <span>ورود به پنل</span>
          </Link>

          <Link
            to="/patients"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.72rem] font-semibold border border-white/60 bg-white/40 hover:bg-white/70 text-[oklch(30%_0.02_20)] transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            <span>بیماران</span>
          </Link>

          <button
            type="button"
            onClick={toggleLang}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white/50 border border-white/60 hover:bg-white/80 transition-all cursor-pointer"
          >
            زبان / Lang
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-9 h-9 rounded-full border border-white/60 bg-white/30 grid place-items-center text-[oklch(40%_0.02_20)] hover:bg-white/60 transition-all shadow-sm cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Hero & Auth Split View */}
      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-80px)] px-6 md:px-12 py-8 items-center gap-8">
        {/* Left Col: Auth & Suite Controller */}
        <section className="lg:col-span-5 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto p-8 rounded-3xl bg-white/65 border border-white/80 backdrop-blur-2xl shadow-xl">
            <div className="flex items-center gap-3 mb-6">
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
                type="button"
                onClick={() => setActiveTab("signin")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "signin"
                    ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm"
                    : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("register")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "register"
                    ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm"
                    : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("plans")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "plans"
                    ? "bg-white/90 text-[oklch(20%_0.02_20)] shadow-sm"
                    : "text-[oklch(60%_0.015_20)] hover:text-black"
                }`}
              >
                Pro Plans 💎
              </button>
            </div>

            {activeTab === "signin" && (
              <SignInForm
                onSubmit={() => {
                  navigate("/login");
                }}
                onDemoLogin={() => {
                  navigate("/login");
                }}
                onForgotPassword={() => showToast("بازیابی رمز", "لینک بازنشانی رمز به ایمیل ارسال شد.")}
              />
            )}

            {activeTab === "register" && (
              <RegisterForm
                onSubmit={() => {
                  navigate("/login");
                }}
              />
            )}

            {activeTab === "plans" && (
              <div className="space-y-4">
                <ProPlansView
                  onSelectPlan={() => {
                    showToast("پلن فعال شد", "پلن تخصصی با موفقیت فعال گردید.");
                    setActiveTab("signin");
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right Col: Luxury Display Typography & Biological Focus */}
        <section className="lg:col-span-7 flex flex-col justify-center items-start lg:pl-8 pointer-events-auto" dir="rtl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/50 border border-white/80 shadow-xs mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[0.65rem] font-bold tracking-widest uppercase text-[oklch(50%_0.095_12)]">
              سیستم هوشمند تحلیل و پایش سلامت پوست سر
            </span>
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
    </div>
  );
};

export default LandingPage;

import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import {
  Users,
  Camera,
  Sparkles,
  Search,
  Plus,
  ArrowUp,
  FileSignature,
  LogOut,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  Award,
  Layers,
  ChevronRight,
  HeartHandshake,
  Cpu,
  Brain,
  Flame,
  Droplets,
  Dna,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, clearAccessToken } from "../api/client.js";
import { useSync } from "../offline/SyncProvider.js";
import { AmberOrbs } from "./AmberOrbs.js";
import { HairCanvas } from "./HairCanvas.js";
import DigitalConsentModal from "./DigitalConsentModal.js";
import LuxuryTiltCard from "./LuxuryTiltCard.js";
const LuxuryScalp3D = lazy(() => import("./LuxuryScalp3D.js"));
import TrichologyRadarChart, { RadarMetric } from "./TrichologyRadarChart.js";
import NeuralSegmentationOverlay from "./NeuralSegmentationOverlay.js";
import FollicleCaliberWaveform from "./FollicleCaliberWaveform.js";
import { createEngine } from "@scalpai/analysis-engine";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt?: string;
  lastVisit?: string;
  scalpCondition?: string;
  hairDensity?: number;
  anagenRatio?: number;
  keratinHealth?: number;
  sebumBalance?: number;
  microcirculation?: number;
  stemCellVitality?: number;
}

interface TrichoscopyImage {
  id: string;
  patientId: string;
  url: string;
  area: "vertex" | "temple" | "frontal" | "occiput";
  date: string;
  density: number;
  thickness: string;
  qualityScore: number;
}

const SAMPLE_PATIENTS: Patient[] = [
  {
    id: "pat-101",
    firstName: "دکتر سارا",
    lastName: "رادمنش",
    phone: "09123456789",
    lastVisit: "۱۴۰۳/۰۶/۱۰",
    scalpCondition: "آلوپسی آندروژنتیک (Grade II)",
    hairDensity: 148,
    anagenRatio: 86,
    keratinHealth: 92,
    sebumBalance: 78,
    microcirculation: 84,
    stemCellVitality: 89,
  },
  {
    id: "pat-102",
    firstName: "مهسا",
    lastName: "کریمی",
    phone: "09129998877",
    lastVisit: "۱۴۰۳/۰۶/۰۸",
    scalpCondition: "تلوژن افلوویوم (استرس بیوشیمیایی)",
    hairDensity: 165,
    anagenRatio: 74,
    keratinHealth: 88,
    sebumBalance: 65,
    microcirculation: 72,
    stemCellVitality: 79,
  },
  {
    id: "pat-103",
    firstName: "نگین",
    lastName: "فرهمند",
    phone: "09351112233",
    lastVisit: "۱۴۰۳/۰۵/۲۸",
    scalpCondition: "درماتیت سبورئیک و میکروالتهاب فولیکولی",
    hairDensity: 122,
    anagenRatio: 79,
    keratinHealth: 81,
    sebumBalance: 42,
    microcirculation: 68,
    stemCellVitality: 73,
  },
];

const SAMPLE_IMAGES: Record<string, TrichoscopyImage[]> = {
  "pat-101": [
    {
      id: "img-01",
      patientId: "pat-101",
      url: "/hero-follicle-bg.jpg",
      area: "vertex",
      date: "۱۴۰۳/۰۶/۱۰",
      density: 148,
      thickness: "72 µm",
      qualityScore: 98,
    },
    {
      id: "img-02",
      patientId: "pat-101",
      url: "/images/scalp-bg.jpg",
      area: "temple",
      date: "۱۴۰۳/۰۵/۱۰",
      density: 134,
      thickness: "64 µm",
      qualityScore: 95,
    },
  ],
};

export const SECTIONS = [
  { id: "patients", label: "پرونده و ماتریس مراجعین", icon: Users },
  { id: "gallery", label: "ویژن تریکوسکوپی 4K", icon: Camera },
  { id: "ai-studio", label: "استودیوی محاسباتی AI", icon: Sparkles },
  { id: "3d-model", label: "هولوگرام ۳ بعدی ساقه مو", icon: Layers },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

interface ClinicalDashboardProps {
  userEmail?: string;
  onLogout: () => void;
}

export const ClinicalDashboard: React.FC<ClinicalDashboardProps> = ({
  userEmail = "tricho@scalpai.clinic",
  onLogout,
}) => {
  const { isOnline, pendingCount } = useSync();

  const [activeSection, setActiveSection] = useState<SectionId>("patients");
  const isManualScrolling = useRef(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const scrollToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    isManualScrolling.current = true;
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    setTimeout(() => {
      isManualScrolling.current = false;
    }, 850);
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowBackToTop(scrollY > 350);

      if (isManualScrolling.current) return;
      const scrollPos = scrollY + 160;

      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const sec = SECTIONS[i];
        const el = document.getElementById(`section-${sec.id}`);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sec.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [selectedPatient, setSelectedPatient] = useState<Patient>(SAMPLE_PATIENTS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ firstName: "", lastName: "", phone: "", condition: "" });
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [localPatients, setLocalPatients] = useState<Patient[]>(SAMPLE_PATIENTS);
  const [localImages, setLocalImages] = useState<Record<string, TrichoscopyImage[]>>(SAMPLE_IMAGES);
  const [selectedArea, setSelectedArea] = useState<"vertex" | "temple" | "frontal" | "occiput">("vertex");

  const handleMockUpload = () => {
    const newImg: TrichoscopyImage = {
      id: `img-${Date.now()}`,
      patientId: selectedPatient.id,
      url: "/hero-follicle-bg.jpg",
      area: selectedArea,
      date: "امروز (لحظاتی پیش)",
      density: Math.round(135 + Math.random() * 25),
      thickness: `${Math.round(62 + Math.random() * 14)} µm`,
      qualityScore: 99,
    };

    setLocalImages((prev) => ({
      ...prev,
      [selectedPatient.id]: [newImg, ...(prev[selectedPatient.id] || [])],
    }));
  };

  // AI Diagnostic State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{
    scores: { redness: number; flakeTexture: number; densityProxy: number };
    severity: number;
    anagenRatio: number;
    hairCaliber: string;
    recommendation: string;
    matrixHydration: number;
    tensorConfidence: number;
    follicularUnits: { single: number; double: number; triple: number };
  }>({
    scores: { redness: 22, flakeTexture: 26, densityProxy: 88 },
    severity: 24,
    anagenRatio: 87,
    hairCaliber: "76 µm (بافت ابریشمی سالم)",
    recommendation:
      "پروتکل پپتیدی بایواکتیو: تجویز لوسیون نانولیپوزومال Copper Tripeptide GHK-Cu، سرم آبرسان اسید هیالورونیک کراس‌لینک و ماساژ فوتوبیومدولاسیون با طول موج ۶۵۰ نانومتر.",
    matrixHydration: 92,
    tensorConfidence: 97.4,
    follicularUnits: { single: 24, double: 52, triple: 24 },
  });

  // Fetch real API patients if online, with fallback to local state
  const { data: apiPatients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiFetch<Patient[]>("/patients?limit=50").catch(() => null),
    retry: false,
  });

  const patientList = apiPatients && apiPatients.length > 0 ? apiPatients : localPatients;

  const filteredPatients = patientList.filter(
    (p) =>
      p.firstName.includes(searchQuery) ||
      p.lastName.includes(searchQuery) ||
      p.phone.includes(searchQuery)
  );

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.firstName || !newPatient.lastName) return;

    const created: Patient = {
      id: `pat-${Date.now().toString().slice(-4)}`,
      firstName: newPatient.firstName,
      lastName: newPatient.lastName,
      phone: newPatient.phone || "09120000000",
      lastVisit: "امروز",
      scalpCondition: newPatient.condition || "پایش تریکولوژی و سلامت کوتیکول",
      hairDensity: 154,
      anagenRatio: 85,
      keratinHealth: 90,
      sebumBalance: 75,
      microcirculation: 80,
      stemCellVitality: 85,
    };

    setLocalPatients([created, ...localPatients]);
    setSelectedPatient(created);
    setNewPatient({ firstName: "", lastName: "", phone: "", condition: "" });
    setIsAddPatientOpen(false);
  };

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const engine = createEngine();
      const syntheticData = new Uint8ClampedArray(128 * 128 * 4);
      for (let i = 0; i < syntheticData.length; i += 4) {
        syntheticData[i] = 225;
        syntheticData[i + 1] = 185;
        syntheticData[i + 2] = 175;
        syntheticData[i + 3] = 255;
      }

      const out = await engine.analyze({
        image: { data: syntheticData, width: 128, height: 128 },
      });

      setAiResult({
        scores: out.scores,
        severity: out.severity,
        anagenRatio: Math.round(82 + Math.random() * 12),
        hairCaliber: `${Math.round(68 + Math.random() * 12)} µm (کالیبر استاندارد)`,
        matrixHydration: Math.round(86 + Math.random() * 10),
        tensorConfidence: 98.2,
        follicularUnits: {
          single: Math.round(18 + Math.random() * 8),
          double: Math.round(48 + Math.random() * 10),
          triple: Math.round(25 + Math.random() * 10),
        },
        recommendation:
          out.scores.redness > 35
            ? "پروتکل تسکین‌بخش فوری: ماسک کلاژن هیدرولیز شده، فیتواستروژن‌های طبیعی و نیاسینامید با تنظیم pH فیزیولوژیک ۵.۵ کف سر."
            : "پروتکل مزوتراپی پپتیدی و بیوتین لیپوزومال: ۲ بار در ماه جهت تقویت سد بیولوژیک و تحریک سلول‌های پاپیلا درم.",
      });
    } catch {
      // Fallback
    } finally {
      setTimeout(() => setIsAnalyzing(false), 900);
    }
  };

  const patientPhotos = localImages[selectedPatient.id] || [
    {
      id: "img-default",
      patientId: selectedPatient.id,
      url: "/hero-follicle-bg.jpg",
      area: "vertex",
      date: "۱۴۰۳/۰۶/۱۰",
      density: selectedPatient.hairDensity || 148,
      thickness: "72 µm",
      qualityScore: 98,
    },
  ];

  // Dynamic Radar Metrics for Selected Patient
  const radarMetrics: RadarMetric[] = [
    { label: "تراکم تار", value: Math.min(100, Math.round(((selectedPatient.hairDensity || 148) / 180) * 100)), benchmark: 85 },
    { label: "فاز آناژن", value: selectedPatient.anagenRatio || 86, benchmark: 88 },
    { label: "کراتین و کورتکس", value: selectedPatient.keratinHealth || 92, benchmark: 90 },
    { label: "توازن سبوم", value: selectedPatient.sebumBalance || 78, benchmark: 80 },
    { label: "میکروسیرکولاسیون", value: selectedPatient.microcirculation || 84, benchmark: 85 },
    { label: "حیات سلول‌های بنیادی", value: selectedPatient.stemCellVitality || 89, benchmark: 90 },
  ];

  return (
    <div
      className="min-h-screen flex flex-col font-sans relative text-[oklch(20%_0.02_20)] bg-[oklch(85%_0.03_28)] antialiased select-none"
      dir="rtl"
    >
      {/* 1. Global Scalp Aesthetic Background Image (Matches Login Page) */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04] pointer-events-none"
        style={{ backgroundImage: `url('/images/scalp-bg.jpg')` }}
      />

      {/* 2. Floating Amber Serum Spheres */}
      <AmberOrbs />

      {/* 3. Floating Hair Strands Canvas */}
      <HairCanvas />

      {/* 4. Top Frosted Glass Navigation Bar (Persistently Sticky) */}
      <header className="sticky top-0 z-50 w-full px-4 sm:px-6 md:px-10 py-3 flex items-center justify-between border-b border-white/60 bg-[oklch(98%_0.01_28/0.75)] backdrop-blur-2xl shadow-[0_4px_24px_oklch(30%_0.04_15/0.08)]">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-2xl rose-gold-gradient grid place-items-center text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)] ring-1 ring-white/60 shrink-0">
              <Brain className="w-5 h-5 drop-shadow-sm text-white" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-base sm:text-lg font-bold tracking-tight text-[oklch(20%_0.02_20)] drop-shadow-xs">
                  ScalpAI Neural Clinic
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] sm:text-[0.62rem] font-mono font-extrabold bg-white/80 text-[oklch(40%_0.02_20)] border border-black/5 flex items-center gap-1 shadow-xs">
                  <Cpu className="w-3 h-3 text-[oklch(62%_0.09_16)]" />
                  AI Vision Core v4.8
                </span>
              </div>
              <div className="flex items-center gap-2 text-[0.68rem] sm:text-[0.72rem] text-[oklch(45%_0.02_20)] flex-wrap">
                <span className="font-medium text-[oklch(30%_0.02_20)]">تریکولوژیست: {userEmail.split("@")[0]}</span>
                <span className="w-1 h-1 rounded-full bg-[oklch(62%_0.09_16/0.4)]" />
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {isOnline ? "موتور عصبی آنلاین" : "پایگاه محلی آفلاین"}
                </span>
                {pendingCount > 0 && (
                  <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[0.65rem] px-2 py-0.5 rounded-full font-bold shadow-xs">
                    {pendingCount} در نوبت سینک
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Module Tabs (Luxury Frosted Glass Pills with Smooth Scroll) */}
          <nav className="hidden lg:flex items-center gap-1.5 mr-6 p-1.5 bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_2px_12px_oklch(30%_0.04_15/0.05)]">
            {SECTIONS.map((sec, idx) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 ${
                    isActive
                      ? "rose-gold-gradient text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)] scale-[1.02]"
                      : "text-[oklch(40%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.65rem] font-mono font-black transition-colors ${
                      isActive ? "bg-white/30 text-white" : "bg-stone-200/70 text-stone-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-[oklch(62%_0.09_16)]"}`} />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile & actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsConsentOpen(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-[oklch(48%_0.095_12)] shadow-xs backdrop-blur-sm transition-all"
          >
            <FileSignature className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
            <span className="hidden sm:inline">امضای رضایت‌نامه</span>
          </button>

          <button
            onClick={() => {
              clearAccessToken();
              onLogout();
            }}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-white/70 text-stone-600 hover:text-red-700 hover:bg-white border border-white/80 transition-all shadow-xs"
            title="خروج از حساب"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* Mobile/Tablet Secondary Tab Bar (Persistently Sticky Below Header) */}
      <div className="lg:hidden sticky top-[61px] sm:top-[65px] z-40 px-3 sm:px-4 py-2 bg-[oklch(98%_0.01_28/0.92)] backdrop-blur-2xl border-b border-white/70 shadow-xs flex items-center gap-2 overflow-x-auto no-scrollbar">
        {SECTIONS.map((sec, idx) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 shrink-0 ${
                isActive
                  ? "rose-gold-gradient text-white shadow-sm scale-[1.02]"
                  : "text-[oklch(40%_0.02_20)] bg-white/70 hover:bg-white"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] font-mono font-black ${
                  isActive ? "bg-white/30 text-white" : "bg-stone-200 text-stone-600"
                }`}
              >
                {idx + 1}
              </span>
              <Icon className="w-3.5 h-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Container: Continuous Clinical Dossier */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 relative z-10 space-y-12">
        {/* SECTION 1: PATIENTS & CLINICAL RADAR OVERVIEW */}
        <section id="section-patients" className="scroll-mt-28 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Patient Directory with 3D Tilt Cards */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                        بخش ۱ از ۴
                      </span>
                      <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                        پرونده‌های تریکولوژی و آنالیز هوشمند
                      </h2>
                    </div>
                    <p className="text-xs text-[oklch(45%_0.02_20)]">
                      پایش لحظه‌ای واحدهای فولیکولی، سلامت پوست سر و فرمولاسیون اختصاصی
                    </p>
                  </div>

                  <button
                    onClick={() => setIsAddPatientOpen(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تشکیل پرونده بالینی جدید</span>
                  </button>
                </div>

                {/* Glass Search Bar */}
                <div className="relative mb-6">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجوی نام بیمار، شماره تماس یا پروتکل تشخیصی..."
                    className="w-full h-12 pr-12 pl-4 rounded-2xl bg-white/70 focus:bg-white backdrop-blur-xl border border-white/90 focus:border-[oklch(62%_0.09_16)] outline-none text-xs font-medium text-[oklch(20%_0.02_20)] shadow-inner transition-all placeholder:text-[oklch(55%_0.015_20)]"
                  />
                  <Search className="absolute right-4 top-3.5 w-5 h-5 text-stone-400" />
                </div>

                {/* Patient Cards (3D Tilt) */}
                <div className="space-y-3.5">
                  {filteredPatients.map((patient) => {
                    const isSelected = selectedPatient.id === patient.id;
                    return (
                      <LuxuryTiltCard
                        key={patient.id}
                        maxTilt={4}
                        className="rounded-2xl cursor-pointer"
                      >
                        <div
                          onClick={() => setSelectedPatient(patient)}
                          className={`p-4 md:p-5 rounded-2xl border transition-all flex items-center justify-between backdrop-blur-xl ${
                            isSelected
                              ? "bg-gradient-to-r from-white/95 via-rose-50/70 to-white/95 border-[oklch(62%_0.09_16/0.7)] shadow-lg shadow-[oklch(62%_0.09_16/0.12)] ring-2 ring-[oklch(62%_0.09_16/0.25)]"
                              : "bg-white/55 hover:bg-white/80 border-white/80 shadow-xs"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-12 h-12 rounded-2xl grid place-items-center font-bold text-sm shadow-sm ring-1 ${
                                isSelected
                                  ? "rose-gold-gradient text-white ring-white/80"
                                  : "bg-white/85 text-[oklch(48%_0.095_12)] ring-white/60 border border-[oklch(62%_0.09_16/0.3)]"
                              }`}
                            >
                              {patient.firstName.replace("دکتر ", "")[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                                  {patient.firstName} {patient.lastName}
                                </h3>
                                <span className="text-[0.65rem] px-2.5 py-0.5 rounded-full bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] font-extrabold border border-[oklch(62%_0.09_16/0.25)]">
                                  {patient.scalpCondition || "ارزیابی سلامت مو"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[0.72rem] text-[oklch(45%_0.02_20)] mt-1">
                                <span>تماس: {patient.phone}</span>
                                <span>•</span>
                                <span>آخرین ویزیت: {patient.lastVisit || "امروز"}</span>
                                <span>•</span>
                                <span className="text-emerald-700 font-bold font-mono">تراکم: {patient.hairDensity || 148} تار/cm²</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatient(patient);
                                scrollToSection("gallery");
                              }}
                              className="p-2.5 rounded-xl bg-white/70 hover:bg-white text-[oklch(40%_0.02_20)] border border-white/80 shadow-xs transition-all"
                              title="مشاهده در ویژن تریکوسکوپ 4K"
                            >
                              <Camera className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatient(patient);
                                scrollToSection("ai-studio");
                              }}
                              className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.3)] shadow-xs transition-all"
                              title="اسکن هوشمند AI"
                            >
                              <Sparkles className="w-4 h-4 text-amber-600" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-stone-400 mr-1" />
                          </div>
                        </div>
                      </LuxuryTiltCard>
                    );
                  })}
                </div>
              </div>

              {/* Longitudinal Waveform */}
              <FollicleCaliberWaveform
                currentCaliber="74 µm"
                densityTrend="+۲۱.۴٪ تراکم تجمعی"
              />
            </div>

            {/* Right 1 Col: Holographic Radar Matrix & Patient Biometrics */}
            <div className="space-y-4">
              <TrichologyRadarChart
                metrics={radarMetrics}
                title={`پروفایل هوشمند: ${selectedPatient.firstName} ${selectedPatient.lastName}`}
                subtitle="آنالیز ۶ بُعدی فولیکول و لایه‌های اپیدرم با دقت نورال"
                aiScore={Math.round(
                  ((selectedPatient.anagenRatio || 86) + (selectedPatient.keratinHealth || 92)) / 2
                )}
              />

              <LuxuryTiltCard maxTilt={5} className="rounded-[32px]">
                <div className="rounded-[32px] p-6 space-y-4 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <span className="text-[0.7rem] font-mono font-bold tracking-widest uppercase text-[oklch(45%_0.02_20)]">
                      TELEMETRY MATRIX
                    </span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-white/80 text-[oklch(35%_0.02_20)] border border-black/5 shadow-xs">
                      ID: {selectedPatient.id}
                    </span>
                  </div>

                  {/* 3 Circular Biometric Gauges */}
                  <div className="grid grid-cols-3 gap-2 py-2 text-center bg-white/60 backdrop-blur-md p-3 rounded-2xl border border-white/80 shadow-xs">
                    <div>
                      <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">تراکم</div>
                      <div className="text-sm font-mono font-black text-[oklch(20%_0.02_20)] mt-0.5">
                        {selectedPatient.hairDensity || 148}
                      </div>
                      <div className="text-[0.6rem] text-stone-500">تار / cm²</div>
                    </div>
                    <div className="border-x border-black/5">
                      <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">فاز آناژن</div>
                      <div className="text-sm font-mono font-black text-emerald-700 mt-0.5">
                        {selectedPatient.anagenRatio || 86}٪
                      </div>
                      <div className="text-[0.6rem] text-emerald-600">رشد بهینه</div>
                    </div>
                    <div>
                      <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">کراتین</div>
                      <div className="text-sm font-mono font-black text-[oklch(48%_0.095_12)] mt-0.5">
                        {selectedPatient.keratinHealth || 92}٪
                      </div>
                      <div className="text-[0.6rem] text-stone-500">استحکام ماتریکس</div>
                    </div>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="pt-2 space-y-2.5">
                    <button
                      onClick={() => scrollToSection("gallery")}
                      className="w-full h-11 rounded-2xl bg-white/70 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-xs font-bold text-[oklch(48%_0.095_12)] flex items-center justify-center gap-2 transition-all shadow-xs"
                    >
                      <Camera className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                      <span>ورود به ویژن تریکوسکوپ 4K (بخش ۲)</span>
                    </button>

                    <button
                      onClick={() => scrollToSection("ai-studio")}
                      className="w-full h-11 rounded-2xl rose-gold-gradient text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-amber-200" />
                      <span>اجرای اسکن و فرمولاسیون پپتیدی (بخش ۳)</span>
                    </button>

                    <button
                      onClick={() => scrollToSection("3d-model")}
                      className="w-full h-11 rounded-2xl bg-white/70 hover:bg-white border border-white/90 text-xs font-bold text-[oklch(35%_0.02_20)] flex items-center justify-center gap-2 transition-all shadow-xs"
                    >
                      <Layers className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                      <span>مشاهده شبیه‌ساز ۳ بعدی ساقه مو (بخش ۴)</span>
                    </button>
                  </div>
                </div>
              </LuxuryTiltCard>
            </div>
          </div>
        </section>

        {/* Visual Divider: Section 1 to Section 2 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            SECTION 02 • TRICHOSCOPY IMAGING
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 2: TRICHOSCOPY GALLERY & NEURAL SEGMENTATION */}
        <section id="section-gallery" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    بخش ۲ از ۴
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    ویژن تریکوسکوپی بیمار: {selectedPatient.firstName} {selectedPatient.lastName}
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">
                  تصاویر میکروسکوپی و تفکیک اتوماتیک واحدهای ۱، ۲ و ۳ تاره با لیزر اسکنر
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollToSection("patients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
                  title="بازگشت به ابتدای پرونده"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">ابتدای پرونده</span>
                </button>
              </div>
            </div>

            {/* Area Selector Tabs */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
              <div className="flex items-center gap-1.5 p-1.5 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xs">
                  {(["vertex", "temple", "frontal", "occiput"] as const).map((area) => (
                    <button
                      key={area}
                      onClick={() => setSelectedArea(area)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selectedArea === area
                          ? "rose-gold-gradient text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)]"
                          : "text-[oklch(40%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/50"
                      }`}
                    >
                      {area === "vertex" && "تاج سر (Vertex)"}
                      {area === "temple" && "شقیقه (Temple)"}
                      {area === "frontal" && "خط رویش (Frontal)"}
                      {area === "occiput" && "پس‌سر (Occiput)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Interactive AI Segmentation HUD */}
              <div className="mb-8">
                <NeuralSegmentationOverlay
                  imageUrl={patientPhotos[0]?.url || "/hero-follicle-bg.jpg"}
                  areaName={
                    selectedArea === "vertex"
                      ? "تاج سر (Vertex)"
                      : selectedArea === "temple"
                      ? "شقیقه (Temple)"
                      : selectedArea === "frontal"
                      ? "خط رویش (Frontal)"
                      : "پس‌سر (Occiput)"
                  }
                  patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                />
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={handleMockUpload}
                className="p-8 rounded-[28px] border-2 border-dashed border-[oklch(62%_0.09_16/0.4)] bg-white/35 text-center mb-8 hover:bg-white/60 hover:border-[oklch(62%_0.09_16)] transition-all cursor-pointer group shadow-xs backdrop-blur-md"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/80 border border-white text-[oklch(62%_0.09_16)] grid place-items-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-xs">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                  برای آپلود تصویر تریکوسکوپ جدید کلیک کنید (یا فایل را رها کنید)
                </h4>
                <p className="text-xs text-[oklch(45%_0.02_20)] mt-1">
                  پشتیبانی از سنسورهای درماتوسکوپی با رزولوشن میکرومتری • ناحیه ذخیره‌سازی: {selectedArea}
                </p>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {patientPhotos.map((photo) => (
                  <LuxuryTiltCard key={photo.id} maxTilt={5} className="rounded-3xl">
                    <div className="rounded-3xl overflow-hidden border border-white/80 bg-white/55 backdrop-blur-xl shadow-md">
                      <div className="relative aspect-4/3 bg-stone-900/10 overflow-hidden">
                        <img
                          src={photo.url}
                          alt="Trichoscopy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-[oklch(20%_0.02_20)] text-[0.65rem] font-bold border border-white/80 shadow-xs">
                          ناحیه: {photo.area}
                        </div>
                        <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 backdrop-blur-md text-emerald-800 text-[0.65rem] font-bold flex items-center gap-1 shadow-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          وضوح کوانتومی {photo.qualityScore}%
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="flex items-center justify-between text-xs text-[oklch(45%_0.02_20)] mb-3 font-mono">
                          <span>تاریخ: {photo.date}</span>
                          <span>ضخامت: {photo.thickness}</span>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-black/5">
                          <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                            تراکم: {photo.density} تار/cm²
                          </span>
                          <button
                            onClick={() => scrollToSection("ai-studio")}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                            <span>آنالیز AI</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </LuxuryTiltCard>
                ))}
              </div>
            </div>
        </section>

        {/* Visual Divider: Section 2 to Section 3 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            SECTION 03 • NEURAL AI ENGINE & FORMULATION
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 3: AI TRICHOLOGY STUDIO */}
        <section id="section-ai-studio" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    بخش ۳ از ۴
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    استودیوی آنالیز عمیق تریکولوژی (Neural Engine Vision)
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">
                  محاسبه شاخص‌های لایه‌های بیولوژیک و تدوین پروتکل مزوتراپی / پپتید برای {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-xl bg-white/80 border border-black/5 text-[0.7rem] font-mono text-[oklch(30%_0.02_20)] flex items-center gap-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Tensor Confidence: {aiResult.tensorConfidence}%</span>
                </div>

                <button
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-md shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 disabled:opacity-60 transition-all active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                  <span>{isAnalyzing ? "پردازش ماتریس..." : "اجرای مجدد اسکن AI"}</span>
                </button>

                <button
                  onClick={() => scrollToSection("patients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
                  title="بازگشت به ابتدای پرونده"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">ابتدای پرونده</span>
                </button>
              </div>
            </div>

              {/* 4 Holographic 3D Metric Dials */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {/* Metric 1 */}
                <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
                  <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">اریتم و التهاب پوست سر</span>
                      <span className="text-xs font-mono font-black text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200">
                        {aiResult.scores.redness}%
                      </span>
                    </div>
                    <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                      <div
                        className="bg-gradient-to-r from-rose-500 to-red-500 h-full rounded-full transition-all duration-700 shadow-xs"
                        style={{ width: `${aiResult.scores.redness}%` }}
                      />
                    </div>
                    <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      وضعیت: میکروالتهاب فولیکولی ملایم
                    </span>
                  </div>
                </LuxuryTiltCard>

                {/* Metric 2 */}
                <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
                  <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">تجمع سبوم و پوسته لایه شاخی</span>
                      <span className="text-xs font-mono font-black text-amber-800 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                        {aiResult.scores.flakeTexture}%
                      </span>
                    </div>
                    <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                      <div
                        className="bg-gradient-to-r from-amber-400 to-yellow-500 h-full rounded-full transition-all duration-700"
                        style={{ width: `${aiResult.scores.flakeTexture}%` }}
                      />
                    </div>
                    <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                      <Droplets className="w-3.5 h-3.5 text-amber-600" />
                      نیازمند اسکراب لایه‌بردار AHA/BHA
                    </span>
                  </div>
                </LuxuryTiltCard>

                {/* Metric 3 */}
                <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
                  <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">فاز رشد فعال (آناژن)</span>
                      <span className="text-xs font-mono font-black text-emerald-800 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                        {aiResult.anagenRatio}%
                      </span>
                    </div>
                    <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                      <div
                        className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-700"
                        style={{ width: `${aiResult.anagenRatio}%` }}
                      />
                    </div>
                    <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      توازن متابولیک مطلوب پیاز مو
                    </span>
                  </div>
                </LuxuryTiltCard>

                {/* Metric 4 */}
                <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
                  <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">هیدراتاسیون ماتریکس مو</span>
                      <span className="text-xs font-mono font-black text-[oklch(48%_0.095_12)] px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200">
                        {aiResult.matrixHydration}٪
                      </span>
                    </div>
                    <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                      <div
                        className="rose-gold-gradient h-full rounded-full transition-all duration-700"
                        style={{ width: `${aiResult.matrixHydration}%` }}
                      />
                    </div>
                    <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                      <Dna className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                      کوتیکول صاف و ساختار کورتکس محکم
                    </span>
                  </div>
                </LuxuryTiltCard>
              </div>

              {/* Protocol Prescription Luxury Card */}
              <div className="p-6 md:p-7 rounded-[28px] bg-white/60 border border-white/80 backdrop-blur-xl shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl rose-gold-gradient text-white grid place-items-center shadow-md shadow-[oklch(62%_0.09_16/0.25)]">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                        پروتکل تجویزی و روتین درمانی اختصاصی (AI Clinical Formulation)
                      </h4>
                      <span className="text-[0.68rem] text-[oklch(45%_0.02_20)]">
                        سنتز شده توسط هوش مصنوعی بر پایه وزن مولکولی پپتیدها و وضعیت بیوشیمیایی اسکالپ
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => alert("گزارش بالینی PDF آماده صدور است.")}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-xs text-[oklch(48%_0.095_12)] transition-all shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                      <span>دانلود گزارش نسخه</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-[oklch(62%_0.09_16/0.2)] leading-relaxed text-xs text-[oklch(20%_0.02_20)] shadow-inner">
                  {aiResult.recommendation}
                </div>
              </div>
            </div>
        </section>

        {/* Visual Divider: Section 3 to Section 4 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            SECTION 04 • 3D HOLOGRAPHIC FOLLICLE
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 4: 3D FOLLICLE & HAIR MODEL SIMULATION */}
        <section id="section-3d-model" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    بخش ۴ از ۴
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    شبیه‌ساز هولوگرافیک ۳ بعدی تار و فولیکول مو
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">
                  چرخش سه‌بعدی ۳۶۰ درجه و تفکیک لایه‌های کورتکس، مدولا و غلاف درونی ریشه
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs bg-white/80 px-4 py-2 rounded-2xl border border-white/80 shadow-xs">
                  <HeartHandshake className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                  <span className="font-bold text-[oklch(20%_0.02_20)]">
                    بیمار: {selectedPatient.firstName} {selectedPatient.lastName}
                  </span>
                </div>

                <button
                  onClick={() => scrollToSection("patients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
                  title="بازگشت به ابتدای پرونده"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">ابتدای پرونده</span>
                </button>
              </div>
            </div>

            {/* Embed 3D Scalp Stage */}
            <div className="w-full rounded-[28px] overflow-hidden border border-white/80 shadow-2xl bg-white/40 backdrop-blur-xl">
              <Suspense
                fallback={
                  <div className="h-[450px] flex items-center justify-center text-xs font-bold text-stone-500">
                    در حال بارگذاری شبیه‌ساز سه‌بعدی فولیکول...
                  </div>
                }
              >
                <LuxuryScalp3D />
              </Suspense>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Back to Top Pill */}
      {showBackToTop && (
        <div className="fixed bottom-6 left-6 z-40 animate-fadeIn transition-all duration-300">
          <button
            onClick={() => scrollToSection("patients")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full rose-gold-gradient text-white text-xs font-bold shadow-xl shadow-[oklch(62%_0.09_16/0.3)] hover:brightness-110 active:scale-95 transition-all border border-white/80 backdrop-blur-md"
            title="اسکرول سریع به ابتدای پرونده"
          >
            <ArrowUp className="w-4 h-4" />
            <span>ابتدای پرونده</span>
          </button>
        </div>
      )}

      {/* Modal: Add Patient */}
      {isAddPatientOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="rounded-[32px] p-6 md:p-8 max-w-md w-full bg-[oklch(98%_0.008_28/0.85)] border border-white/90 shadow-[0_24px_60px_oklch(30%_0.04_15/0.18)] backdrop-blur-2xl animate-fadeIn">
            <h3 className="text-xl font-serif font-bold text-[oklch(20%_0.02_20)] mb-1">
              تشکیل پرونده بالینی اختصاصی
            </h3>
            <p className="text-xs text-[oklch(45%_0.02_20)] mb-6">
              اطلاعات مراجع را جهت شروع پایش و پرونده تریکولوژی وارد نمایید
            </p>

            <form onSubmit={handleAddPatient} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">نام</label>
                <input
                  type="text"
                  required
                  value={newPatient.firstName}
                  onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                  placeholder="مثال: پروانه"
                  className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">نام خانوادگی</label>
                <input
                  type="text"
                  required
                  value={newPatient.lastName}
                  onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
                  placeholder="مثال: یزدانی"
                  className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">شماره تماس</label>
                <input
                  type="tel"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  placeholder="مثال: 09123456789"
                  className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">عارضه یا وضعیت اولیه</label>
                <input
                  type="text"
                  value={newPatient.condition}
                  onChange={(e) => setNewPatient({ ...newPatient, condition: e.target.value })}
                  placeholder="مثال: کنترل ریزش فصلی و افزایش تراکم"
                  className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  className="flex-1 h-12 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
                >
                  ثبت پرونده
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddPatientOpen(false)}
                  className="px-5 h-12 rounded-2xl bg-white/80 hover:bg-white border border-stone-200 text-xs font-bold text-[oklch(40%_0.02_20)] transition-all"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Digital Consent Form */}
      {isConsentOpen && (
        <DigitalConsentModal
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          patientPhone={selectedPatient.phone}
          isOpen={isConsentOpen}
          onClose={() => setIsConsentOpen(false)}
        />
      )}
    </div>
  );
};

export default ClinicalDashboard;


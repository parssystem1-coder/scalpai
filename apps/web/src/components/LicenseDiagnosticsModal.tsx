import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, Clock, CheckCircle2, AlertTriangle, Key, Cpu, RefreshCw, X, Database, Users, Laptop } from "lucide-react";
import { formatDate } from "@scalpai/shared";

interface LicenseDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LicenseDiagnosticsModal({ isOpen, onClose }: LicenseDiagnosticsModalProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";

  const [simulatedClockDrift, setSimulatedClockDrift] = useState(false);
  const [lastVerifiedTime, setLastVerifiedTime] = useState<Date>(() => new Date(Date.now() - 3600000));
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  // Mocked/Derived license state based on Ed25519 specification
  const licenseClaims = {
    sub: "clinic-scalp-tehran-01",
    name: "مرکز فوق‌تخصصی تریکولوژی اسکالپ اسکراب",
    tier: "professional" as const,
    features: ["analysis:advanced", "offline:full", "sync:outbox", "digital_consent", "white_label"],
    maxSeats: 5,
    maxPatients: 2000,
    issuedAt: Math.floor(Date.now() / 1000) - 30 * 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 120 * 86400,
    graceDays: 14,
  };

  const isClockTampered = simulatedClockDrift;
  const isGraceActive = false; // standard active state
  const daysRemaining = Math.ceil((licenseClaims.expiresAt - Math.floor(Date.now() / 1000)) / 86400);

  const handleVerifyLicense = () => {
    setLastVerifiedTime(new Date());
  };

  return (
    <div
      id="license-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="license-modal-container"
        className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
        dir={isFa ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${isClockTampered ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
              {isClockTampered ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                {isFa ? "پایشگر سلامت لایسنس و سلف‌هاستد (فاز ۳)" : "License & Self-Hosted Diagnostics"}
              </h2>
              <span className="text-[11px] font-mono text-stone-500">Ed25519 Token Verification • ADR-0021</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
              isClockTampered
                ? "bg-red-50/80 border-red-200 text-red-900"
                : "bg-emerald-50/80 border-emerald-200 text-emerald-950"
            }`}
          >
            {isClockTampered ? (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 text-xs">
              <strong className="block font-bold">
                {isClockTampered
                  ? isFa ? "هشدار: دستکاری ساعت سیستم شناسایی شد (Clock Anti-Tamper Triggered)" : "Warning: Clock Tampering Detected"
                  : isFa ? "لایسنس معتبر و فعال است (امضای رمزنگاری شده Ed25519 تایید گردید)" : "License Valid & Active (Ed25519 Verified)"}
              </strong>
              <p className="leading-relaxed opacity-90">
                {isClockTampered
                  ? isFa
                    ? "ساعت سیستم عقب کشیده شده است. سیستم طبق سند ADR-0021 به صورت خودکار عملیات آفلاین را قفل می‌کند تا مانع تقلب در دوره فرجه ۱۴ روزه شود."
                    : "System clock set backward. Safe-mode enforcement prevents grace period abuse."
                  : isFa
                    ? `اشتراک کلینیک در سطح پیشرفته (${licenseClaims.tier.toUpperCase()}) با ${daysRemaining} روز اعتبار باقیمانده بدون انحراف زمانی فعال است.`
                    : `Active ${licenseClaims.tier.toUpperCase()} tier with ${daysRemaining} days remaining.`}
              </p>
            </div>
          </div>

          {/* Diagnostics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Clock Verification Card */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <Clock className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span>{isFa ? "صحت‌سنجی ساعت سیستم (Anti-Tamper)" : "System Clock Verification"}</span>
              </div>
              <div className="space-y-2 text-xs text-stone-600 font-mono">
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans">{isFa ? "زمان جاری سیستم:" : "Current System Time:"}</span>
                  <span className="font-bold text-stone-900">{currentTime.toLocaleTimeString("fa-IR")}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans">{isFa ? "آخرین بررسی سرور:" : "Last Verified Time:"}</span>
                  <span className="text-stone-800">{lastVerifiedTime.toLocaleTimeString("fa-IR")}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[11px] text-stone-500 font-sans">{isFa ? "وضعیت دوره فرجه آفلاین:" : "Offline Grace Period:"}</span>
                  <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-800 text-[10px] font-bold">
                    {isGraceActive ? "در حال مصرف فرجه ۱۴ روزه" : "عدم نیاز (اتصال سرور برقرار)"}
                  </span>
                </div>
              </div>
            </div>

            {/* License Claims & Quota Card */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <Key className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span>{isFa ? "سهمیه‌ها و ظرفیت مجاز" : "License Claims & Quotas"}</span>
              </div>
              <div className="space-y-2 text-xs text-stone-600 font-mono">
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-stone-400" />
                    {isFa ? "حداکثر صندلی همزمان:" : "Max Concurrent Seats:"}
                  </span>
                  <span className="font-bold text-stone-900">{licenseClaims.maxSeats} کاربر</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-stone-400" />
                    {isFa ? "سقف بیماران آفلاین:" : "Max Offline Patients:"}
                  </span>
                  <span className="font-bold text-stone-900">{licenseClaims.maxPatients} پرونده</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-stone-400" />
                    {isFa ? "تاریخ انقضای لایسنس:" : "License Expiry:"}
                  </span>
                  <span className="text-stone-800 font-sans font-semibold">
                    {formatDate(new Date(licenseClaims.expiresAt * 1000).toISOString(), { locale: "fa", format: "short" })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Feature Entitlements Chips */}
          <div>
            <span className="block text-xs font-bold text-stone-800 mb-2">
              {isFa ? "ماژول‌ها و دسترسی‌های فعال بالینی:" : "Active Feature Entitlements:"}
            </span>
            <div className="flex flex-wrap gap-2">
              {licenseClaims.features.map((feat) => (
                <span
                  key={feat}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-stone-100 border border-stone-300 text-stone-700"
                >
                  <Cpu className="w-3 h-3 text-[oklch(62%_0.09_16)]" />
                  <span>{feat}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Test & Simulation Controls */}
          <div className="p-4 rounded-2xl bg-stone-100/70 border border-stone-200 space-y-3">
            <span className="block text-xs font-bold text-stone-800">
              {isFa ? "ابزار تست و شبیه‌سازی گارد امنیتی (مخصوص بازرسین و تست فنی):" : "Security Guard Simulator:"}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSimulatedClockDrift(!simulatedClockDrift)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  simulatedClockDrift
                    ? "bg-red-600 text-white shadow-xs"
                    : "bg-white border border-stone-300 text-stone-700 hover:bg-stone-50"
                }`}
              >
                {simulatedClockDrift ? "غیرفعال کردن خطای شبیه‌سازی ساعت" : "شبیه‌سازی عقب‌کشیدن ساعت سیستم"}
              </button>
              <button
                type="button"
                onClick={handleVerifyLicense}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                <span>صحت‌سنجی مجدد لایسنس</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-stone-50 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-bold bg-stone-800 text-white hover:bg-stone-900 transition-colors"
          >
            {isFa ? "بستن" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

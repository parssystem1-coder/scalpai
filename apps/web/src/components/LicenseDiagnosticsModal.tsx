import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, Clock, CheckCircle2, AlertTriangle, Key, Cpu, RefreshCw, X, Database, Users, Laptop } from "lucide-react";
import { formatDate, formatRelativeTime, CLINIC_DEFAULT_TIMEZONE, type LicenseStatusDto } from "@scalpai/shared";
import { apiFetch, ApiError } from "../api/client.js";

interface LicenseDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Self-hosted licence diagnostics (phase 10 / M2, ADR-0043).
 *
 * What this panel used to be: a hard-coded claims object, a
 * `professional` tier, 120 days remaining, a static badge string, and a
 * button that flipped a local boolean to "simulate" clock tampering. Nothing was
 * verified and nothing was fetched - an unlicensed install saw a green tick.
 *
 * What it is now: a read-only view of `GET /license/status`. The server verifies
 * a real EdDSA token against a configured public key and returns the verdict,
 * the public claims and the fingerprint of the key it used. "Unlicensed" is a
 * state this panel can and does display.
 */

type PanelTone = "ok" | "warn" | "bad" | "neutral";

const TONE_BY_STATE: Record<LicenseStatusDto["state"], PanelTone> = {
  active: "ok",
  grace_period: "warn",
  expired: "bad",
  tampered: "bad",
  invalid_signature: "bad",
  unlicensed: "neutral",
};

const STATE_TITLE_FA: Record<LicenseStatusDto["state"], string> = {
  active: "لایسنس معتبر است و امضای Ed25519 توسط سرور تأیید شد",
  grace_period: "لایسنس منقضی شده و سیستم در دوره فرجه است",
  expired: "لایسنس و دوره فرجه منقضی شده است",
  tampered: "هشدار: دستکاری ساعت سیستم شناسایی شد",
  invalid_signature: "امضای توکن لایسنس تأیید نشد",
  unlicensed: "برای این نصب لایسنسی تنطیم نشده است",
};

const STATE_TITLE_EN: Record<LicenseStatusDto["state"], string> = {
  active: "Licence valid - Ed25519 signature verified by the server",
  grace_period: "Licence expired - grace period active",
  expired: "Licence and grace period expired",
  tampered: "Warning: system clock rollback detected",
  invalid_signature: "Licence token signature did not verify",
  unlicensed: "No licence is configured for this installation",
};

const TONE_CLASSES: Record<PanelTone, string> = {
  ok: "bg-emerald-50/80 border-emerald-200 text-emerald-950",
  warn: "bg-amber-50/80 border-amber-200 text-amber-950",
  bad: "bg-red-50/80 border-red-200 text-red-900",
  neutral: "bg-stone-50/80 border-stone-200 text-stone-800",
};

export default function LicenseDiagnosticsModal({ isOpen, onClose }: LicenseDiagnosticsModalProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";

  const [status, setStatus] = useState<LicenseStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await apiFetch<LicenseStatusDto>("/license/status"));
    } catch (e) {
      setStatus(null);
      setError(
        e instanceof ApiError
          ? `[${e.code}] ${e.message}`
          : isFa
            ? "دریافت وضعیت لایسنس از سرور ناموفق بود"
            : "Could not read the licence status from the server",
      );
    } finally {
      setLoading(false);
    }
  }, [isFa]);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const tone: PanelTone = status ? TONE_BY_STATE[status.state] : "neutral";
  const bad = tone === "bad";
  const claims = status?.claims;

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
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${bad ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
              {bad ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                {isFa ? "پایشگر سلامت لایسنس و سلف‌هاستد" : "License & Self-Hosted Diagnostics"}
              </h2>
              <span className="text-[11px] font-mono text-stone-500">
                {isFa ? "اعتبارسنجی سمت سرور · ADR-0043" : "Server-side verification · ADR-0043"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFa ? "بستن" : "Close"}
            className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {loading && !status && (
            <p className="text-xs text-stone-500" data-testid="license-loading">
              {isFa ? "در حال دریافت وضعیت از سرور…" : "Reading the status from the server…"}
            </p>
          )}

          {error && (
            <div role="alert" className="p-4 rounded-2xl border bg-red-50/80 border-red-200 text-red-900 text-xs">
              {error}
            </div>
          )}

          {status && (
            <div
              data-testid="license-state"
              data-state={status.state}
              className={`p-4 rounded-2xl border flex items-start gap-3.5 ${TONE_CLASSES[tone]}`}
            >
              {bad ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 text-xs">
                <strong className="block font-bold">
                  {isFa ? STATE_TITLE_FA[status.state] : STATE_TITLE_EN[status.state]}
                </strong>
                {status.reason && <p className="leading-relaxed opacity-90">{status.reason}</p>}
                {typeof status.daysRemaining === "number" && (
                  <p className="leading-relaxed opacity-90">
                    {isFa
                      ? `اعتبار باقی‌مانده: ${status.daysRemaining} روز`
                      : `${status.daysRemaining} days remaining`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Verification provenance — what was checked, and with which key */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <Clock className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span>{isFa ? "اعتبارسنجی انجام‌شده" : "Verification performed"}</span>
              </div>
              <div className="space-y-2 text-xs text-stone-600 font-mono">
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans">{isFa ? "زمان بررسی سرور:" : "Checked at:"}</span>
                  <span className="font-bold text-stone-900 font-sans">
                    {status
                      ? formatRelativeTime(status.checkedAt, {
                          locale: isFa ? "fa" : "en",
                          timeZone: CLINIC_DEFAULT_TIMEZONE,
                        })
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-[11px] text-stone-500 font-sans">
                    {isFa ? "امضا بررسی شد؟" : "Signature checked?"}
                  </span>
                  <span className="text-stone-800 font-sans">
                    {status?.verified ? (isFa ? "بله" : "Yes") : isFa ? "خیر" : "No"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[11px] text-stone-500 font-sans">{isFa ? "اثر انگشت کلید:" : "Key fingerprint:"}</span>
                  <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-800 text-[10px] font-bold" data-testid="license-key">
                    {status?.keyFingerprint ?? (isFa ? "کلیدی تنطیم نشده" : "no key configured")}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <Key className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span>{isFa ? "سهمیه‌ها و ظرفیت مجاز" : "License Claims & Quotas"}</span>
              </div>
              {claims ? (
                <div className="space-y-2 text-xs text-stone-600 font-mono">
                  <div className="flex justify-between items-center py-1 border-b border-stone-200">
                    <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-stone-400" />
                      {isFa ? "حداکثر صندلی همزمان:" : "Max Concurrent Seats:"}
                    </span>
                    <span className="font-bold text-stone-900">{claims.maxSeats}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-stone-200">
                    <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-stone-400" />
                      {isFa ? "سقف بیماران آفلاین:" : "Max Offline Patients:"}
                    </span>
                    <span className="font-bold text-stone-900">{claims.maxPatients}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-stone-400" />
                      {isFa ? "تاریخ انقضای لایسنس:" : "License Expiry:"}
                    </span>
                    <span className="text-stone-800 font-sans font-semibold">
                      {formatDate(new Date(claims.expiresAt * 1000).toISOString(), {
                        locale: isFa ? "fa" : "en",
                        format: "short",
                        timeZone: CLINIC_DEFAULT_TIMEZONE,
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  {isFa
                    ? "تا وقتی امضای یک توکن معتبر تأیید نشود، هیچ ادعایی نمایش داده نمی‌شود."
                    : "No claims are shown until a real token signature verifies."}
                </p>
              )}
            </div>
          </div>

          {/* Entitlements straight from the verified claims */}
          {claims && claims.features.length > 0 && (
            <div>
              <span className="block text-xs font-bold text-stone-800 mb-2">
                {isFa ? "ماژول‌ها و دسترسی‌های فعال بالینی:" : "Active Feature Entitlements:"}
              </span>
              <div className="flex flex-wrap gap-2">
                {claims.features.map((feat) => (
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
          )}

          <div className="p-4 rounded-2xl bg-stone-100/70 border border-stone-200 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              data-testid="license-refresh"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
              <span>{isFa ? "صحت‌سنجی مجدد لایسنس" : "Re-verify licence"}</span>
            </button>
            <span className="text-[11px] text-stone-500">
              {isFa
                ? "این پنل فقط خروجی اعتبارسنجی سرور را نشان می‌دهد و هیچ وضعیتی را خودش نمی‌سازد."
                : "This panel only displays the server's verdict; it never derives one locally."}
            </span>
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

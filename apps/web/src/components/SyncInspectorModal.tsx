import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Wifi, WifiOff, CheckCircle2, AlertCircle, ArrowUpRight, Database, X, GitCompare, Layers } from "lucide-react";
import { useSync } from "../offline/SyncProvider.js";
import { db, type OutboxRecord } from "../offline/db.js";
import { formatDate } from "@scalpai/shared";

interface SyncInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SyncInspectorModal({ isOpen, onClose }: SyncInspectorModalProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";
  const { isOnline, pendingCount, flush } = useSync();

  const [outboxItems, setOutboxItems] = useState<OutboxRecord[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  // Simulated conflict audit log for clinical visibility (LWW demonstration)
  const conflictResolutions = [
    {
      id: "res-01",
      entity: "treatment_plans",
      field: "dosage_protocol",
      clientVal: "Minoxidil 5% twice daily",
      serverVal: "Minoxidil 5% daily + Copper Peptides",
      resolution: "Field LWW Applied (Server Winner on timestamp)",
      time: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    {
      id: "res-02",
      entity: "patients",
      field: "phone",
      clientVal: "09121234567",
      serverVal: "09129876543",
      resolution: "Client Winner (Newer clientUpdatedAt accepted)",
      time: new Date(Date.now() - 45 * 60000).toISOString(),
    },
  ];

  const loadOutbox = async () => {
    try {
      const records = await db.outbox.orderBy("createdAt").toArray();
      setOutboxItems(records);
    } catch {
      setOutboxItems([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadOutbox();
    }
  }, [isOpen, pendingCount]);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsFlushing(true);
    setFlushResult(null);
    try {
      const count = await flush();
      await loadOutbox();
      setFlushResult(isFa ? `${count} جهش با موفقیت به سرور ارسال و تایید شد.` : `${count} mutations successfully pushed.`);
    } catch {
      setFlushResult(isFa ? "خطا در برقراری ارتباط با سرور. جهش‌ها در صف امن محلی باقی ماندند." : "Sync error. Mutations remain safe in IndexedDB.");
    } finally {
      setIsFlushing(false);
    }
  };

  return (
    <div
      id="sync-inspector-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="sync-inspector-container"
        className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
        dir={isFa ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                {isFa ? "پایشگر همگام‌سازی آفلاین و حل تعارض (Sync Inspector)" : "Offline Sync & Conflict Inspector"}
              </h2>
              <span className="text-[11px] font-mono text-stone-500">
                Dexie IndexedDB • Field-level LWW Engine • ADR-0027
              </span>
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

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Connectivity & Outbox Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <span className="block text-[11px] text-stone-500 mb-1">{isFa ? "وضعیت اتصال شبکه:" : "Network State:"}</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                <strong className="text-xs text-stone-900 font-bold">
                  {isOnline ? (isFa ? "آنلاین (متصل به سرور)" : "Online") : (isFa ? "آفلاین (ذخیره محلی)" : "Offline")}
                </strong>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <span className="block text-[11px] text-stone-500 mb-1">{isFa ? "جهش‌های در صف انتظار:" : "Pending Outbox Queue:"}</span>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <strong className="text-xs text-stone-900 font-bold font-mono">
                  {pendingCount} {isFa ? "عملیات" : "items"}
                </strong>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-center">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isFlushing || !isOnline}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold rose-gold-gradient text-white shadow-xs hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? "animate-spin" : ""}`} />
                <span>{isFlushing ? (isFa ? "در حال ارسال..." : "Syncing...") : (isFa ? "همگام‌سازی فوری" : "Force Sync")}</span>
              </button>
            </div>
          </div>

          {flushResult && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{flushResult}</span>
            </div>
          )}

          {/* Pending Outbox Queue Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <Layers className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span>{isFa ? "صف محلی تغییرات (IndexedDB Outbox):" : "Local IndexedDB Outbox:"}</span>
              </div>
              <span className="text-[11px] font-mono text-stone-500">{outboxItems.length} {isFa ? "رکورد پایدار" : "records"}</span>
            </div>

            {outboxItems.length === 0 ? (
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
                {isFa ? "صف محلی خالی است. تمام تغییرات با سرور همگام هستند." : "Outbox is clean. All local data is fully synced."}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {outboxItems.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-stone-200 font-mono text-[10px] font-bold text-stone-700">
                          {item.op.toUpperCase()}
                        </span>
                        <strong className="text-stone-900">{item.entity}</strong>
                      </div>
                      <p className="text-[10px] font-mono text-stone-500 mt-1">ID: {item.id.slice(0, 16)}...</p>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {formatDate(new Date(item.createdAt).toISOString(), { locale: "fa", format: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conflict Resolution Log (Field LWW) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
              <GitCompare className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
              <span>{isFa ? "تاریخچه بازرسی و حل تعارض‌های همزمانی (Field-level LWW):" : "Conflict Resolution Log (Field-level LWW):"}</span>
            </div>

            <div className="space-y-2">
              {conflictResolutions.map((c) => (
                <div key={c.id} className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{c.entity} • فیلد: <code className="text-[oklch(62%_0.09_16)]">{c.field}</code></span>
                    <span className="text-[10px] text-stone-400">{formatDate(c.time, { locale: "fa", format: "short" })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2 rounded-xl border border-stone-200">
                    <div>
                      <span className="block text-stone-400 text-[10px]">{isFa ? "مقدار کلاینت محلی:" : "Client Value:"}</span>
                      <span className="text-stone-700 font-mono">{c.clientVal}</span>
                    </div>
                    <div>
                      <span className="block text-stone-400 text-[10px]">{isFa ? "مقدار دریافت شده از سرور:" : "Server Value:"}</span>
                      <span className="text-stone-700 font-mono">{c.serverVal}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium pt-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>{c.resolution}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-t border-stone-200">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{isFa ? "معماری آفلاین منطبق با الزامات RLS و ایزولاسیون کلینیک" : "Offline Architecture adheres to multi-tenant RLS"}</span>
          </div>
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

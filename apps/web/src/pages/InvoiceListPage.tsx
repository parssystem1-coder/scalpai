import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.js";
import "./invoice.i18n.js";

/**
 * موج ۴ (D13) — لیست و صدور فاکتور برای owner/منشی.
 *
 * POS دکمه نیست؛ فاکتور است (سند بدهی D13). همه‌ی endpointها از قبل موجودند —
 * این صفحه فقط وب است: لیست + فیلتر state، صدور پیش‌فاکتور از کاتالوگ
 * (productId → قیمت/شرح/مالیات از کاتالوگ می‌آید، کاربر فقط تعداد/تخفیف
 * می‌دهد)، و اکشن‌های issue/pay/void. `void` فقط owner (آینه‌ی @Roles سرور).
 */

interface InvoiceRow {
  id: string;
  number: string | null;
  state: string;
  currency: string;
  total: number;
  paidAmount: number;
  issuedAt: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  currency: string;
  active: boolean;
}

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

function errCode(e: unknown): string {
  return e instanceof ApiError ? e.code : "ERROR";
}

const PAGE_SIZE = 20;

export const InvoiceListPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // فرم صدور: یک سطر از کاتالوگ + بیمار. حداقلِ قابل‌اعتماد، نه ویرایشگر کامل.
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");

  const load = useCallback(
    async (state: string) => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
        if (state) q.set("state", state);
        const rows = await apiFetch<InvoiceRow[]>(`/billing/invoices?${q.toString()}`);
        setInvoices(Array.isArray(rows) ? rows : []);
      } catch {
        // خطای خام ممکن است داده‌ی حساس داشته باشد: پیام عمومی، بدون لاگ.
        setError(t("invoice.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(stateFilter);
  }, [load, stateFilter]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [prods, pats] = await Promise.all([
          apiFetch<ProductRow[]>("/billing/products?active=true&limit=100"),
          apiFetch<PatientRow[]>("/patients?limit=100"),
        ]);
        if (!alive) return;
        setProducts(Array.isArray(prods) ? prods : []);
        setPatients(Array.isArray(pats) ? pats : []);
      } catch {
        // کاتالوگ/بیماران برای «صدور» لازم‌اند نه برای «لیست» — بی‌صدا رد می‌کنیم؛
        // دکمه‌ی صدور در نبود گزینه‌ها غیرفعال می‌ماند.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const action = async (id: string, path: string, body?: unknown, method = "POST") => {
    setBusyId(id);
    setActionError(null);
    try {
      await apiFetch(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      await load(stateFilter);
    } catch (e) {
      setActionError(
        errCode(e) === "QUOTA_EXCEEDED"
          ? t("invoice.quotaExceeded")
          : t("invoice.actionFailed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !productId) return;
    setBusyId("create");
    setActionError(null);
    try {
      await apiFetch("/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          items: [{ productId, quantity: Number(quantity) || 1, discount: Number(discount) || 0 }],
        }),
      });
      setShowCreate(false);
      setPatientId("");
      setProductId("");
      setQuantity("1");
      setDiscount("0");
      await load(stateFilter);
    } catch (err) {
      setActionError(
        errCode(err) === "QUOTA_EXCEEDED" ? t("invoice.quotaExceeded") : t("invoice.actionFailed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[oklch(85%_0.03_28)] p-4 md:p-8" aria-labelledby="invoice-title">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 id="invoice-title" className="text-2xl font-black">{t("invoice.title")}</h1>
            <p className="mt-1 text-sm opacity-65">{t("invoice.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label={t("invoice.filterLabel")}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-xl border border-white bg-white/80 px-3 py-2 text-sm shadow-xs"
              data-testid="invoice-state-filter"
            >
              <option value="">{t("invoice.filterAll")}</option>
              {["draft", "issued", "paid", "partially_paid", "void", "refunded"].map((s) => (
                <option key={s} value={s}>{t(`invoice.state.${s}`)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
              data-testid="invoice-create-toggle"
            >
              {showCreate ? t("invoice.cancel") : t("invoice.newInvoice")}
            </button>
          </div>
        </header>

        {showCreate && (
          <form
            onSubmit={(e) => void createInvoice(e)}
            className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm"
            aria-label={t("invoice.newInvoice")}
            data-testid="invoice-create-form"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-bold">
                {t("invoice.patient")}
                <select
                  required
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t("invoice.pick")}</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} — {p.phone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                {t("invoice.product")}
                <select
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t("invoice.pick")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.price.toLocaleString("fa-IR")} {p.currency}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                {t("invoice.quantity")}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm"
                  dir="ltr"
                />
              </label>
              <label className="text-sm font-bold">
                {t("invoice.discount")}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm"
                  dir="ltr"
                />
              </label>
            </div>
            <p className="mt-2 text-xs opacity-60">{t("invoice.catalogNote")}</p>
            <button
              type="submit"
              disabled={!patientId || !productId || busyId !== null}
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busyId === "create" ? t("invoice.saving") : t("invoice.createDraft")}
            </button>
          </form>
        )}

        {actionError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {loading && <p className="text-sm opacity-60">{t("invoice.loading")}</p>}
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && invoices.length === 0 && (
          <p className="text-sm opacity-60">{t("invoice.empty")}</p>
        )}

        {invoices.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/70 shadow-sm">
            <table className="w-full text-sm" data-testid="invoice-table">
              <thead>
                <tr className="border-b border-black/10 text-start opacity-60">
                  <th className="p-3 text-start">{t("invoice.colNumber")}</th>
                  <th className="p-3 text-start">{t("invoice.colState")}</th>
                  <th className="p-3 text-start">{t("invoice.colTotal")}</th>
                  <th className="p-3 text-start">{t("invoice.colPaid")}</th>
                  <th className="p-3 text-start">{t("invoice.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const canIssue = inv.state === "draft";
                  const canPay = inv.state === "issued" || inv.state === "partially_paid";
                  const canVoid = isOwner && (inv.state === "issued" || inv.state === "partially_paid" || inv.state === "draft");
                  return (
                    <tr key={inv.id} className="border-b border-black/5">
                      <td className="p-3 font-bold" dir="ltr">{inv.number ?? "—"}</td>
                      <td className="p-3">{t(`invoice.state.${inv.state}`)}</td>
                      <td className="p-3" dir="ltr">{inv.total.toLocaleString("fa-IR")}</td>
                      <td className="p-3" dir="ltr">{inv.paidAmount.toLocaleString("fa-IR")}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {canIssue && (
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => void action(inv.id, `/billing/invoices/${inv.id}/issue`, {})}
                              className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                            >
                              {t("invoice.issue")}
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => void action(inv.id, `/billing/invoices/${inv.id}/payments`, { amount: inv.total - inv.paidAmount, method: "cash" })}
                              className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                            >
                              {t("invoice.payFull")}
                            </button>
                          )}
                          {canVoid && (
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => {
                                const reason = window.prompt(t("invoice.voidPrompt"));
                                if (reason && reason.trim().length >= 4) {
                                  void action(inv.id, `/billing/invoices/${inv.id}/void`, { reason: reason.trim() });
                                }
                              }}
                              className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-40"
                            >
                              {t("invoice.void")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs opacity-50">
          <Link to="/usage" className="underline">{t("invoice.usageLink")}</Link>
        </p>
      </div>
    </main>
  );
};

export default InvoiceListPage;

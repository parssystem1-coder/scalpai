import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import "./usage.i18n.js";

interface UsageRow { metric: string; used: number; limit: number | null; periodStart: string; }
interface UsageReport { periodStart: string; usage: UsageRow[]; }

/**
 * موج ۳ (D10) — صفحه‌ی مصرف پلن برای owner.
 *
 * سه شمارنده‌ی فاز ۵a با سقف موثر پلن، و CTA ارتقا وقتی سهمیه پر شده
 * (DoD #4 پلی‌بوک: ۴۰۳ِ QUOTA_EXCEEDED دیگر کور نباشد). `limit: null`
 * یعنی پلن این متریک را محدود نکرده — «نامحدود» نمایش داده می‌شود، نه صفر.
 */
export const UsagePage: React.FC = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await apiFetch<UsageReport>("/metering/usage");
        if (alive) setReport(data);
      } catch {
        // خطای خام ممکن است PHI داشته باشد: نه لاگ می‌شود نه نمایش داده می‌شود.
        if (alive) setError(t("usage.loadFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const exceeded = (report?.usage ?? []).some((row) => row.limit !== null && row.used >= row.limit);

  return (
    <main
      className="min-h-screen bg-[oklch(85%_0.03_28)] p-4 md:p-8"
      aria-labelledby="usage-title"
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 id="usage-title" className="text-2xl font-black">{t("usage.title")}</h1>
          <p className="mt-1 text-sm opacity-65">{t("usage.subtitle")}</p>
        </header>

        {exceeded && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
            data-testid="usage-upgrade-cta"
          >
            <p className="text-sm font-bold text-amber-900">{t("usage.exceededBanner")}</p>
            <Link
              to="/plans"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              {t("usage.upgradeCta")}
            </Link>
          </div>
        )}

        {loading && <p className="text-sm opacity-60">{t("usage.loading")}</p>}
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {report && (
          <ul className="space-y-3">
            {report.usage.map((row) => {
              const pct = row.limit !== null && row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
              return (
                <li
                  key={row.metric}
                  className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm"
                  data-testid={`usage-${row.metric}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold">{t(`usage.metric.${row.metric}`)}</span>
                    <span className="text-sm" dir="ltr">
                      {row.limit === null
                        ? t("usage.unlimitedValue", { used: row.used })
                        : t("usage.limitedValue", { used: row.used, limit: row.limit })}
                    </span>
                  </div>
                  {row.limit !== null && (
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-black/10"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t(`usage.metric.${row.metric}`)}
                    >
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-red-600" : "bg-slate-900"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
};

export default UsagePage;

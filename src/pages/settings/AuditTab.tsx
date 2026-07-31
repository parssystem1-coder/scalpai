/**
 * AuditTab — نمایش ردپای حسابرسی (فاز ۲ / AUD-11)
 * -----------------------------------------------------------------------
 * مشکلی که این تب حل می‌کند: `docs/privacy.md` ادعای «پاسخ‌پذیری از طریق
 * audit_log» می‌کرد، ولی متد `getAuditLog` هیچ مصرف‌کنندهٔ رابط کاربری نداشت —
 * یعنی کاربر/بازرس هیچ راهی برای دیدنش نداشت و ادعا فقط روی کاغذ بود.
 *
 * منطق (ترجمهٔ رویداد، تاریخ شمسی، CSV) عمداً در `src/lib/auditTrail.ts` است
 * تا بدون رندر UI تست شود؛ این فایل فقط نمایش و ناوبری است.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Download, RefreshCw, AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';
import { db, electronUtils } from '../../db';
import type { AuditLogEntry } from '../../db/types';
import { useT, useLang } from '../../i18n';
import { settingsDict } from './strings';
import type { Notify } from './types';
import {
  AUDIT_PAGE_SIZE,
  auditEventLabel,
  auditPageCount,
  buildAuditCsv,
  formatAuditTimestamp,
  isSensitiveAuditEvent,
  summarizeAuditDetail,
} from '../../lib/auditTrail';

export default function AuditTab({ notify }: { notify: Notify }) {
  const t = useT(settingsDict);
  const { lang, isRtl } = useLang();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setFailed(false);
    try {
      const [rows, count] = await Promise.all([
        db.getAuditLog({ limit: AUDIT_PAGE_SIZE, offset: targetPage * AUDIT_PAGE_SIZE }),
        db.getAuditLogCount(),
      ]);
      setEntries(rows);
      setTotal(count);
    } catch (error) {
      console.error('Audit trail load failed:', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  /**
   * خروجی CSV برای بازرس. خودِ این عمل یک «خروج داده» است، پس عمداً از مسیر
   * استاندارد ذخیرهٔ فایل عبور می‌کند تا در main ثبت و allowlist رعایت شود.
   */
  const exportCsv = async () => {
    try {
      // برای گزارش بازرسی کل سیاهه لازم است، نه فقط صفحهٔ جاری
      const all = await db.getAuditLog({ limit: 1000, offset: 0 });
      const csv = buildAuditCsv(all, lang);
      const fileName = `scalpai-audit-${new Date().toISOString().split('T')[0]}.csv`;

      if (electronUtils.isElectron) {
        const savedPath = await electronUtils.saveFileDialog(csv, fileName);
        if (savedPath) notify('success', t('auditExportDone'));
        return;
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      notify('success', t('auditExportDone'));
    } catch (error) {
      console.error('Audit CSV export failed:', error);
      notify('error', t('auditExportError'));
    }
  };

  // نسخهٔ مرورگر اصلاً لایهٔ حسابرسی ندارد — به‌جای جدول خالیِ گمراه‌کننده،
  // پیام صریح نشان داده می‌شود (همان الگوی EncryptionPanel).
  if (!electronUtils.isElectron) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/50">
        {t('auditWebUnavailable')}
      </div>
    );
  }

  const pageCount = auditPageCount(total, AUDIT_PAGE_SIZE);
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText size={18} className="text-teal-300" />
          {t('auditTitle')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('auditRefresh')}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || total === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/20 text-teal-200 hover:bg-teal-500/30 text-xs disabled:opacity-50"
          >
            <Download size={14} />
            {t('auditExportCsv')}
          </button>
        </div>
      </div>

      <p className="text-xs opacity-60 leading-6">{t('auditIntro')}</p>
      <p className="text-xs text-amber-200/60 leading-6 flex items-start gap-1.5">
        <AlertTriangle size={12} className="flex-shrink-0 mt-1" />
        <span>{t('auditPrivacyNote')}</span>
      </p>

      {failed && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {t('auditLoadError')}
        </div>
      )}

      {!failed && !loading && entries.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm opacity-60">
          {t('auditEmpty')}
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-white/5">
              <tr>
                <th className="px-3 py-2 text-start font-medium whitespace-nowrap">{t('auditColTime')}</th>
                <th className="px-3 py-2 text-start font-medium whitespace-nowrap">{t('auditColEvent')}</th>
                <th className="px-3 py-2 text-start font-medium whitespace-nowrap">{t('auditColActor')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('auditColDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 whitespace-nowrap opacity-70" dir="ltr">
                    {formatAuditTimestamp(entry.createdAt, lang)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={isSensitiveAuditEvent(entry.event) ? 'text-amber-300' : 'text-white/80'}>
                      {auditEventLabel(entry.event, lang)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap opacity-70">{entry.actor || '—'}</td>
                  <td className="px-3 py-2 opacity-60 break-all">{summarizeAuditDetail(entry.detail) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40"
          >
            <PrevIcon size={14} />
            {t('auditPrev')}
          </button>
          <span className="opacity-60" dir="ltr">{page + 1} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1 || loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40"
          >
            {t('auditNext')}
            <NextIcon size={14} />
          </button>
        </div>
      )}

      <p className="text-xs opacity-40 leading-6">{t('auditRetentionNote')}</p>
    </div>
  );
}

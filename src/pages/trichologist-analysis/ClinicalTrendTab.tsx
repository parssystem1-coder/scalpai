import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  ClipboardList,
  LineChart as LineChartIcon,
  Loader,
  User,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, type GalleryItem } from '../../db';
import { useAnalysesStore, useGalleryStore, useSessionsStore } from '../../store';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { useLang, useT } from '../../i18n';
import {
  FIELD_LABELS_EN,
  FIELD_LABELS_FA,
  buildQuestionnaireVisitTimeline,
  buildRegionLensPhotoPairs,
  buildScoreTrendPoints,
} from '../../lib/clinicalChangesTrend';
import { trichoDict } from './strings';
import ImageLightbox from './ImageLightbox';

interface Props {
  selectedClient: string;
  clientName?: string;
}

export default function ClinicalTrendTab({ selectedClient, clientName }: Props) {
  const t = useT(trichoDict);
  const { lang, isRtl } = useLang();
  const { analyses, fetchAnalyses } = useAnalysesStore();
  const { sessions, fetchSessions } = useSessionsStore();
  const { fetchByClient } = useGalleryStore();

  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof db.getQuestionnaireRevisionsByClient>>>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<GalleryItem | null>(null);

  useEffect(() => {
    void fetchAnalyses();
    void fetchSessions();
  }, [fetchAnalyses, fetchSessions]);

  useEffect(() => {
    if (!selectedClient) {
      setGallery([]);
      setRevisions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [photos, qrevs] = await Promise.all([
          fetchByClient(selectedClient),
          db.getQuestionnaireRevisionsByClient(selectedClient),
        ]);
        if (cancelled) return;
        setGallery(photos);
        setRevisions(qrevs);
      } catch (error) {
        console.error('Failed to load clinical trend data:', error);
        if (!cancelled) {
          setGallery([]);
          setRevisions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient, fetchByClient]);

  const clientAnalyses = useMemo(
    () => analyses.filter(a => a.clientId === selectedClient),
    [analyses, selectedClient],
  );
  const clientSessions = useMemo(
    () => sessions.filter(s => s.clientId === selectedClient),
    [sessions, selectedClient],
  );

  const visitTimeline = useMemo(
    () => buildQuestionnaireVisitTimeline(revisions, clientSessions, clientAnalyses),
    [revisions, clientSessions, clientAnalyses],
  );
  const scoreTrend = useMemo(() => buildScoreTrendPoints(clientAnalyses), [clientAnalyses]);
  const photoPairs = useMemo(() => buildRegionLensPhotoPairs(gallery), [gallery]);

  const chartData = useMemo(
    () =>
      scoreTrend.map(point => ({
        ...point,
        date: formatDateForDisplay(point.dateLabel),
        label: `${formatDateForDisplay(point.dateLabel)} (${point.source === 'ai' ? 'AI' : isRtl ? 'آفلاین' : 'Offline'})`,
      })),
    [scoreTrend, isRtl],
  );

  if (!selectedClient) {
    return (
      <div className="text-center py-16 opacity-50">
        <User size={64} className="mx-auto mb-4 opacity-30" />
        <p>{t('selectClientFirst')}</p>
        <p className="text-sm mt-2">{t('selectClientHint')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 opacity-50">
        <Loader className="animate-spin mx-auto mb-3" size={28} />
        <p className="text-sm">{t('trendLoading')}</p>
      </div>
    );
  }

  const fieldLabel = (key: keyof typeof FIELD_LABELS_FA) =>
    lang === 'fa' ? FIELD_LABELS_FA[key] : FIELD_LABELS_EN[key];

  const emptyAll =
    visitTimeline.length === 0 && scoreTrend.length === 0 && photoPairs.length === 0;

  return (
    <div className="space-y-8">
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
        <p className="font-semibold">
          {t('trendFor')}: {clientName || selectedClient}
        </p>
        <p className="text-sm opacity-60 mt-1">{t('trendIntro')}</p>
      </div>

      {emptyAll && (
        <div className="text-center py-12 opacity-50">
          <Activity size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('trendEmpty')}</p>
        </div>
      )}

      {/* ۱. خط زمانی پرسشنامه */}
      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <ClipboardList size={18} className="text-blue-300" />
          {t('trendQuestionnaireTimeline')}
        </h3>
        {visitTimeline.length === 0 ? (
          <p className="text-sm opacity-50">{t('trendNoQuestionnaire')}</p>
        ) : (
          <div className="relative ps-4 border-s border-white/15 space-y-4">
            {visitTimeline.map(visit => (
              <div key={visit.revisionId} className="relative">
                <span className="absolute -start-[21px] top-2 w-2.5 h-2.5 rounded-full bg-blue-400 ring-4 ring-blue-400/20" />
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{formatDateForDisplay(visit.dateLabel)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                      {t('statusFinal')}
                    </span>
                  </div>
                  <p className="text-xs opacity-50 mt-1">
                    {t('trendAnalysesInVisit')}: {visit.analysisCount}
                  </p>
                  {visit.changedFields.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="text-xs opacity-55 me-1">{t('trendChangedFields')}:</span>
                      {visit.changedFields.map(field => (
                        <span
                          key={field}
                          className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-400/25 text-xs"
                        >
                          {fieldLabel(field)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs opacity-45 mt-2">{t('trendNoFieldChanges')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ۲. روند امتیازها */}
      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <LineChartIcon size={18} className="text-emerald-300" />
          {t('trendScoreChart')}
        </h3>
        {chartData.length < 2 ? (
          <p className="text-sm opacity-50">{t('trendNeedMoreScores')}</p>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="density" name={t('trendDensity')} stroke="#34d399" strokeWidth={2} dot />
                <Line type="monotone" dataKey="oiliness" name={t('trendOiliness')} stroke="#fb923c" strokeWidth={2} dot />
                <Line type="monotone" dataKey="dryness" name={t('trendDryness')} stroke="#facc15" strokeWidth={2} dot />
                <Line type="monotone" dataKey="dandruff" name={t('trendDandruff')} stroke="#c084fc" strokeWidth={2} dot />
                <Line type="monotone" dataKey="redness" name={t('trendRedness')} stroke="#f87171" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ۳. مقایسه عکس هم‌ناحیه/هم‌لنز */}
      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Camera size={18} className="text-cyan-300" />
          {t('trendPhotoCompare')}
        </h3>
        <p className="text-sm opacity-50">{t('trendPhotoCompareHint')}</p>
        {photoPairs.length === 0 ? (
          <p className="text-sm opacity-50">{t('trendNoPhotoPairs')}</p>
        ) : (
          <div className="space-y-4">
            {photoPairs.map(pair => (
              <div key={pair.key} className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {lang === 'fa' ? pair.regionFa : pair.regionEn}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md border border-black/20"
                    style={{ background: `${pair.lensColor}33`, color: pair.lensColor }}
                  >
                    <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: pair.lensColor }} />
                    {lang === 'fa' ? pair.lensFa : pair.lensEn}
                  </span>
                  <span className="text-xs opacity-45">
                    {pair.photoCount} {t('trendPhotos')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { item: pair.older, caption: t('trendOlderPhoto') },
                    { item: pair.newer, caption: t('trendNewerPhoto') },
                  ].map(({ item, caption }) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPreview(item)}
                      className="text-start rounded-xl overflow-hidden border border-white/10 bg-black/20 hover:border-white/25 transition"
                    >
                      <div className="aspect-square bg-black/40">
                        <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs opacity-55">{caption}</p>
                        <p className="text-sm mt-0.5">{formatDateForDisplay(item.createdAt.slice(0, 10))}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {preview && (
        <ImageLightbox
          image={preview}
          caption={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

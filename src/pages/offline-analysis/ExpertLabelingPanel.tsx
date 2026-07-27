import { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Loader, CheckCircle, Search, ChevronDown, Check } from 'lucide-react';
import type { Client, GalleryItem, TrainingSampleLabel } from '../../db';
import {
  observationGroups,
  observationGroupLabel,
  observationsInGroup,
  observationLabel,
  normalizeObservationIds,
} from '../../lib/diagnosisCatalog';
import { useLang, usePick, useT } from '../../i18n';
import { offlineDict } from './strings';
import ExpertLesionAnnotator, { type ExpertLesion } from './ExpertLesionAnnotator';

const LABEL_KEYS = [
  'oiliness', 'dryness', 'dandruff', 'redness', 'densityScore',
  'shine', 'patchiness', 'pigmentation', 'hairThickness',
] as const;

type LabelMetricKey = (typeof LABEL_KEYS)[number];

const LABEL_KEY_TO_DICT: Record<LabelMetricKey, keyof typeof offlineDict> = {
  oiliness: 'oiliness',
  dryness: 'dryness',
  dandruff: 'dandruff',
  redness: 'redness',
  densityScore: 'hairDensity',
  shine: 'shine',
  patchiness: 'patchiness',
  pigmentation: 'pigmentation',
  hairThickness: 'hairThickness',
};

interface Props {
  clients: Client[];
  labelClient: string;
  onLabelClientChange: (id: string) => void;
  labelGallery: GalleryItem[];
  labelImage: GalleryItem | null;
  onLabelImageChange: (item: GalleryItem | null) => void;
  labelForm: TrainingSampleLabel;
  onLabelFormChange: React.Dispatch<React.SetStateAction<TrainingSampleLabel>>;
  labelSaving: boolean;
  onSave: () => void;
  onSuggest: () => void;
  /** اگر در حال ویرایش نمونهٔ موجود (مثلاً AI) باشیم */
  editingSampleId?: string | null;
  editingFromAi?: boolean;
  onCancelEdit?: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * وقتی true باشد، بخش جستجو/انتخاب مشتری کاملاً مخفی می‌شود — برای مصرف‌کننده‌هایی
   * (مثل تب «استخر تصاویر آموزشی») که تصویر را از بیرون (نه از این پنل) انتخاب می‌کنند
   * و اصلاً به مفهوم «مشتری» وابسته نیستند.
   */
  hideClientSelector?: boolean;
}

function syncObservationsFromLesions(
  observations: string[] | undefined,
  lesions: ExpertLesion[],
): string[] {
  const fromLesions = normalizeObservationIds(lesions.map(l => l.type));
  const base = normalizeObservationIds(observations ?? []);
  const set = new Set([...base, ...fromLesions]);
  return [...set];
}

export default function ExpertLabelingPanel({
  clients, labelClient, onLabelClientChange, labelGallery, labelImage, onLabelImageChange,
  labelForm, onLabelFormChange, labelSaving, onSave, onSuggest,
  editingSampleId, editingFromAi, onCancelEdit, panelRef, hideClientSelector,
}: Props) {
  const t = useT(offlineDict);
  const pick = usePick();
  const { lang } = useLang();
  const selectedObs = labelForm.observations ?? [];
  const lesions = (labelForm.lesions ?? []).filter(
    (l): l is ExpertLesion => Array.isArray(l.bbox) && l.bbox.length >= 4,
  ).map(l => ({
    type: l.type,
    confidence: l.confidence ?? 1,
    bbox: l.bbox as number[],
  }));

  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find(c => c.id === labelClient);

  useEffect(() => {
    if (selectedClient) {
      setClientSearchQuery(`${selectedClient.firstName} ${selectedClient.lastName}`);
    } else if (!labelClient) {
      setClientSearchQuery('');
    }
  }, [labelClient, selectedClient]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const recentClients = useMemo(
    () => [...clients].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 10),
    [clients],
  );

  const filteredClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    if (!q) return recentClients;
    return clients
      .filter(c =>
        `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [clients, clientSearchQuery, recentClients]);

  const handleSelectClient = (client: Client) => {
    onLabelClientChange(client.id);
    setClientSearchQuery(`${client.firstName} ${client.lastName}`);
    setShowClientDropdown(false);
  };

  const toggleObservation = (id: string) => {
    onLabelFormChange(prev => {
      const current = prev.observations ?? [];
      const next = current.includes(id)
        ? current.filter(o => o !== id)
        : [...(current || []), id];
      return { ...prev, observations: next };
    });
  };

  const handleLesionsChange = (nextLesions: ExpertLesion[]) => {
    onLabelFormChange(prev => ({
      ...prev,
      lesions: nextLesions,
      observations: syncObservationsFromLesions(prev.observations, nextLesions),
    }));
  };

  const isEditing = !!editingSampleId;

  return (
    <div
      ref={panelRef as React.RefObject<HTMLDivElement> | undefined}
      className="rounded-2xl bg-white/5 border border-white/10 p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Tag size={20} className="text-emerald-400" />
        <h3 className="font-semibold">{t('expertManualLabeling')}</h3>
      </div>
      <p className="text-sm opacity-70 mb-4">{t('expertLabelHint')}</p>
      {isEditing && (
        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 flex flex-wrap items-center justify-between gap-2">
          <p>{editingFromAi ? t('editingAiSample') : t('editingExpertSample')}</p>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs"
            >
              {t('cancelEdit')}
            </button>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 mb-4 ${hideClientSelector ? '' : 'md:grid-cols-2'}`}>
        {!hideClientSelector && (
        <div className="relative" ref={clientDropdownRef}>
          <label className="block text-sm mb-2 opacity-70">{t('selectClientOption')}</label>
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={18} />
            <input
              type="text"
              value={clientSearchQuery}
              onChange={e => {
                const value = e.target.value;
                setClientSearchQuery(value);
                setShowClientDropdown(true);
                if (labelClient && selectedClient) {
                  const fullName = `${selectedClient.firstName} ${selectedClient.lastName}`;
                  if (value !== fullName) onLabelClientChange('');
                }
              }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder={t('searchOrSelectClient')}
              className="w-full ps-12 pe-10 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowClientDropdown(v => !v)}
              className="absolute top-1/2 -translate-y-1/2 end-3 opacity-50 hover:opacity-100"
            >
              <ChevronDown size={18} className={`transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showClientDropdown && (
            <div className="absolute top-full start-0 end-0 mt-1 bg-gray-900 border border-white/20 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50">
              {!clientSearchQuery.trim() && (
                <div className="px-4 py-2 text-xs opacity-50 border-b border-white/10">
                  {t('recentClients')}
                </div>
              )}
              {filteredClients.length === 0 ? (
                <div className="px-4 py-6 text-center opacity-50 text-sm">{t('noClientsFound')}</div>
              ) : (
                filteredClients.map(client => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleSelectClient(client)}
                    className={`w-full px-4 py-3 text-start hover:bg-white/10 transition flex items-center gap-3 ${
                      labelClient === client.id ? 'bg-emerald-500/20 text-emerald-300' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">
                        {client.firstName?.[0] || '?'}{client.lastName?.[0] || ''}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{client.firstName} {client.lastName}</div>
                      <div className="text-sm opacity-50 truncate">{client.phone}</div>
                    </div>
                    {labelClient === client.id && <Check size={18} className="text-emerald-400 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          )}

          {labelClient && (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
              <Check size={14} />
              <span>{t('clientSelected')}</span>
            </div>
          )}
        </div>
        )}

        <div>
          <label className="block text-sm mb-2 opacity-70">{t('selectImageOption')}</label>
          <select
            value={labelImage?.id || ''}
            onChange={e => onLabelImageChange(labelGallery.find(g => g.id === e.target.value) || null)}
            disabled={!hideClientSelector && !labelClient}
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 disabled:opacity-40"
          >
            <option value="">{t('selectImageOption')}</option>
            {labelGallery.map(g => (
              <option key={g.id} value={g.id}>{g.filename || g.id}</option>
            ))}
          </select>
        </div>
      </div>

      {(labelImage || isEditing) && (
        <div className="flex flex-col lg:flex-row gap-6">
          {labelImage ? (
            <div className="lg:w-56 flex-shrink-0">
              <ExpertLesionAnnotator
                imageUrl={labelImage.url}
                lesions={lesions}
                onChange={handleLesionsChange}
                clickToEnlargeHint={t('clickToEnlarge')}
                drawHint={t('drawLesionHint')}
                pickLabelTitle={t('pickLesionLabel')}
                cancelLabel={t('cancelBox')}
                removeLabel={t('removeBox')}
                drawnBoxesTitle={t('drawnLesionBoxes')}
                noBoxesLabel={t('noDrawnBoxes')}
              />
            </div>
          ) : (
            <div className="lg:w-56 flex-shrink-0 rounded-xl bg-white/5 border border-white/10 p-4 text-sm opacity-60">
              {t('selectImageOption')}
            </div>
          )}

          <div className="flex-1 space-y-3">
            {LABEL_KEYS.map(key => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{t(LABEL_KEY_TO_DICT[key])}</span>
                  <span>{labelForm[key] ?? 0}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={labelForm[key] ?? 0}
                  onChange={e => onLabelFormChange(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
            ))}

            <div>
              <h4 className="text-sm font-medium mb-2">{t('selectDiagnoses')}</h4>
              <div className="space-y-3 max-h-80 overflow-y-auto pe-1">
                {observationGroups.map(group => (
                  <div key={group.id}>
                    <p className="text-[11px] opacity-50 mb-1.5">
                      {observationGroupLabel(group.id, lang)}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {observationsInGroup(group.id).map(opt => {
                        const isSelected = selectedObs.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleObservation(opt.id)}
                            className={`p-2 rounded-xl text-xs text-center transition ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-white/5 hover:bg-white/10'
                            }`}
                          >
                            {observationLabel(opt.id, lang)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <select
                value={labelForm.hairLossLevel || ''}
                onChange={e => onLabelFormChange(prev => ({ ...prev, hairLossLevel: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm"
              >
                <option value="">{t('hairLossLevel')}</option>
                <option value={pick('خفیف', 'Mild')}>{t('mild')}</option>
                <option value={pick('متوسط', 'Moderate')}>{t('moderate')}</option>
                <option value={pick('شدید', 'Severe')}>{t('severe')}</option>
              </select>
              <select
                value={labelForm.hairDensityLevel || ''}
                onChange={e => onLabelFormChange(prev => ({ ...prev, hairDensityLevel: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm"
              >
                <option value="">{t('densityLevel')}</option>
                <option value={pick('کم', 'Low')}>{t('low')}</option>
                <option value={pick('متوسط', 'Medium')}>{t('medium')}</option>
                <option value={pick('زیاد', 'High')}>{t('high')}</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={onSave}
                disabled={labelSaving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              >
                {labelSaving ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {isEditing ? t('saveCorrection') : t('saveLabel')}
              </button>
              {isEditing && onCancelEdit && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                >
                  {t('cancelEdit')}
                </button>
              )}
              <button
                onClick={onSuggest}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
              >
                {t('autoSuggest')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

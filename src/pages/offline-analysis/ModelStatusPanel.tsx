import { Brain, Loader, Sparkles, Trash2 } from 'lucide-react';
import type { LocalModelMetadata, TrainingSample } from '../../db';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { FEATURE_VERSION } from '../../lib/scalpFeatures';
import {
  FEATURE_VERSION_WITH_QUESTIONNAIRE,
  MIN_QUESTIONNAIRE_CLIENTS_FOR_V4,
  MIN_QUESTIONNAIRE_SAMPLES_FOR_V4,
  hasUsableQuestionnaireFeatures,
} from '../../lib/questionnaireMlFeatures';
import {
  MIN_SAMPLES_TO_TRAIN,
  MIN_QUALITY_SAMPLES,
  MODEL_ARCHITECTURE,
} from '../../lib/localModelConstants';
import { usePick, useT } from '../../i18n';
import { offlineDict } from './strings';

function isUsableModelVersion(version?: string) {
  return version === FEATURE_VERSION || version === FEATURE_VERSION_WITH_QUESTIONNAIRE;
}

interface Props {
  trainingSamples: TrainingSample[];
  samplesBySource: Record<string, number>;
  untrainedSamplesCount: number;
  eligibleCount: number;
  approvedAiCount: number;
  pendingAiCount: number;
  modelMetadata: LocalModelMetadata | null;
  modelHasWeights: boolean;
  training: boolean;
  trainProgress: { epoch: number; loss?: number; val_loss?: number } | null;
  trainError: string;
  useLocalModel: boolean;
  onTrain: () => void;
  onDeleteModel: () => void;
  onToggleLocalModel: (checked: boolean) => void;
}

function fmt(n?: number, digits = 4) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
}

export default function ModelStatusPanel({
  trainingSamples, samplesBySource, untrainedSamplesCount,
  eligibleCount, approvedAiCount, pendingAiCount,
  modelMetadata, modelHasWeights, training, trainProgress, trainError, useLocalModel,
  onTrain, onDeleteModel, onToggleLocalModel,
}: Props) {
  const t = useT(offlineDict);
  const pick = usePick();
  const expertCount = samplesBySource.expert || 0;
  const qualityCount = expertCount + approvedAiCount;
  const canTrain = eligibleCount >= MIN_SAMPLES_TO_TRAIN && qualityCount >= MIN_QUALITY_SAMPLES;
  const modelBelowStandard = !!modelMetadata && (
    (modelMetadata.sampleCount ?? 0) < MIN_SAMPLES_TO_TRAIN
    || !modelMetadata.architecture
    || modelMetadata.architecture !== MODEL_ARCHITECTURE
    || typeof modelMetadata.holdoutMae !== 'number'
  );
  const questionnaireSampleCount = trainingSamples.filter(s =>
    hasUsableQuestionnaireFeatures(s.questionnaireFeatures),
  ).length;
  const questionnaireClientCount = new Set(
    trainingSamples
      .filter(s => hasUsableQuestionnaireFeatures(s.questionnaireFeatures))
      .map(s => s.clientId || s.id),
  ).size;
  const v4GateReady = questionnaireSampleCount >= MIN_QUESTIONNAIRE_SAMPLES_FOR_V4
    && questionnaireClientCount >= MIN_QUESTIONNAIRE_CLIENTS_FOR_V4;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain size={20} className="text-purple-400" />
        <h3 className="font-semibold">{t('localLearningModel')}</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="rounded-xl bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{trainingSamples.length}</div>
          <p className="text-xs opacity-70 mt-1">{t('totalSamples')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{eligibleCount}</div>
          <p className="text-xs opacity-70 mt-1">{t('eligibleSamples')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{expertCount}</div>
          <p className="text-xs opacity-70 mt-1">{t('expertLabeled')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{untrainedSamplesCount}</div>
          <p className="text-xs opacity-70 mt-1">{t('unusedInTraining')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <span className="opacity-60">{t('aiAutoLabeled')}: </span>
          <span className="font-medium">{samplesBySource.online_ai || 0}</span>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <span className="opacity-60">{t('approvedAi')}: </span>
          <span className="font-medium text-emerald-300">{approvedAiCount}</span>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <span className="opacity-60">{t('pendingAi')}: </span>
          <span className="font-medium text-yellow-300">{pendingAiCount}</span>
        </div>
      </div>

      <p className="text-xs opacity-60 mb-4">{t('trainProgressHint')}</p>

      {modelMetadata && (
        <div className="text-sm opacity-80 mb-4 space-y-1.5 rounded-xl bg-white/5 p-4">
          <p>
            {t('currentModelVersion')} {modelMetadata.version} — {t('trainedOn')}{' '}
            {modelMetadata.sampleCount} {t('samplesOn')}{' '}
            {formatDateForDisplay(modelMetadata.trainedAt.split('T')[0])}
          </p>
          {modelMetadata.architecture && (
            <p>{t('architecture')} {modelMetadata.architecture}</p>
          )}
          {typeof modelMetadata.epochsRun === 'number' && (
            <p>{t('epochsRun')} {modelMetadata.epochsRun}</p>
          )}
          {typeof modelMetadata.loss === 'number' && (
            <p>
              {t('trainingLoss')} {fmt(modelMetadata.loss)}
              {typeof modelMetadata.valLoss === 'number'
                ? ` — ${t('valLoss')}: ${fmt(modelMetadata.valLoss)}`
                : ''}
            </p>
          )}
          {(typeof modelMetadata.maeScores === 'number' || typeof modelMetadata.valMaeScores === 'number') && (
            <p>
              {t('maeScores')} {fmt(modelMetadata.maeScores, 2)}
              {typeof modelMetadata.valMaeScores === 'number'
                ? ` — ${t('valMae')}: ${fmt(modelMetadata.valMaeScores, 2)}`
                : ''}
            </p>
          )}
          {(typeof modelMetadata.obsF1 === 'number' || typeof modelMetadata.valObsF1 === 'number') && (
            <p>
              {t('obsF1')} {fmt(modelMetadata.obsF1, 3)}
              {typeof modelMetadata.valObsF1 === 'number'
                ? ` — val: ${fmt(modelMetadata.valObsF1, 3)}`
                : ''}
            </p>
          )}
          {(typeof modelMetadata.holdoutMae === 'number' || typeof modelMetadata.holdoutObsF1 === 'number') && (
            <p>
              {t('holdoutMae')} {fmt(modelMetadata.holdoutMae, 2)}
              {typeof modelMetadata.holdoutObsF1 === 'number'
                ? ` — ${t('holdoutF1')} ${fmt(modelMetadata.holdoutObsF1, 3)}`
                : ''}
            </p>
          )}
          {modelMetadata.evaluation && (
            <p className={modelMetadata.evaluation.holdoutClientCount > 0 ? 'text-emerald-300' : 'text-yellow-300'}>
              {pick(
                `ارزیابی ${modelMetadata.evaluation.mode === 'client' ? 'بر اساس مشتری' : 'بر اساس نمونه'} — مشتری‌ها: ${modelMetadata.evaluation.clientCount}، hold-out: ${modelMetadata.evaluation.holdoutClientCount}`,
                `${modelMetadata.evaluation.mode === 'client' ? 'Client-based' : 'Sample-based'} evaluation — clients: ${modelMetadata.evaluation.clientCount}, hold-out: ${modelMetadata.evaluation.holdoutClientCount}`,
              )}
            </p>
          )}
          <p>
            {t('featureVersionLabel')}{' '}
            <span className="font-medium">{modelMetadata.featureVersion || '—'}</span>
            {modelMetadata.featureVersion === FEATURE_VERSION_WITH_QUESTIONNAIRE
              ? ` (${t('modelIncludesQuestionnaire')})`
              : ''}
          </p>
          {modelMetadata.v4Experiment && (
            <p className={modelMetadata.v4Experiment.promoted ? 'text-emerald-300' : 'opacity-80'}>
              {t('v4Experiment')}: {modelMetadata.v4Experiment.reason}
            </p>
          )}
          {!isUsableModelVersion(modelMetadata.featureVersion) && (
            <p className="text-yellow-400">{t('modelOutdated')}</p>
          )}
          {modelBelowStandard && (
            <p className="text-yellow-400">{t('modelBelowStandard')}</p>
          )}
          {modelHasWeights && modelMetadata.architecture === MODEL_ARCHITECTURE
            && typeof modelMetadata.obsF1 !== 'number' && (
            <p className="text-yellow-400">{t('modelCatalogUpdated')}</p>
          )}
          {modelMetadata.history && modelMetadata.history.length > 0 && (
            <div className="pt-2 border-t border-white/10 mt-2">
              <p className="text-xs opacity-60 mb-1">{t('modelHistory')}</p>
              <ul className="text-xs space-y-0.5 opacity-70 max-h-24 overflow-y-auto">
                {[...modelMetadata.history].reverse().slice(0, 5).map(h => (
                  <li key={`${h.version}-${h.trainedAt}`}>
                    v{h.version} — {h.sampleCount} samples — MAE {fmt(h.valMaeScores ?? h.holdoutMae, 2)}
                    {h.featureVersion ? ` — ${h.featureVersion}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white/5 p-3 mb-4 text-xs opacity-80 space-y-1">
        <p>
          {t('v4GateStatus')}:{' '}
          {v4GateReady
            ? t('v4GateReady')
            : pick(
              `نیاز به ${MIN_QUESTIONNAIRE_SAMPLES_FOR_V4} نمونه و ${MIN_QUESTIONNAIRE_CLIENTS_FOR_V4} مشتری با پرسشنامه (فعلاً ${questionnaireSampleCount} نمونه / ${questionnaireClientCount} مشتری).`,
              `Need ${MIN_QUESTIONNAIRE_SAMPLES_FOR_V4} samples and ${MIN_QUESTIONNAIRE_CLIENTS_FOR_V4} clients with questionnaire (now ${questionnaireSampleCount} samples / ${questionnaireClientCount} clients).`,
            )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onTrain}
          disabled={training || !canTrain}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
        >
          {training ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {training
            ? pick(
              `در حال آموزش... (epoch ${trainProgress?.epoch ?? 0}${typeof trainProgress?.val_loss === 'number' ? ` · val ${trainProgress.val_loss.toFixed(3)}` : ''})`,
              `Training... (epoch ${trainProgress?.epoch ?? 0}${typeof trainProgress?.val_loss === 'number' ? ` · val ${trainProgress.val_loss.toFixed(3)}` : ''})`,
            )
            : t('trainModel')}
        </button>

        {modelHasWeights
          && isUsableModelVersion(modelMetadata?.featureVersion)
          && !modelBelowStandard && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!useLocalModel}
              onChange={e => onToggleLocalModel(e.target.checked)}
              className="w-4 h-4"
            />
            {t('useLocalModel')}
          </label>
        )}

        {modelHasWeights && (
          <button
            onClick={onDeleteModel}
            className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm flex items-center gap-1.5"
          >
            <Trash2 size={14} /> {t('deleteModel')}
          </button>
        )}
      </div>

      {!canTrain && (
        <p className="text-xs text-yellow-400 mt-3">
          {pick(
            `برای آموزش حداقل ${MIN_SAMPLES_TO_TRAIN} نمونهٔ واجد شرایط و ${MIN_QUALITY_SAMPLES} نمونهٔ متخصص/تأییدشده لازم است (واجد شرایط: ${eligibleCount}، کیفیت: ${qualityCount}). نمونه‌های AI را تأیید کنید یا برچسب متخصص بزنید.`,
            `Need at least ${MIN_SAMPLES_TO_TRAIN} eligible and ${MIN_QUALITY_SAMPLES} expert/approved samples (eligible: ${eligibleCount}, quality: ${qualityCount}). Approve AI samples or add expert labels.`,
          )}
        </p>
      )}
      {trainError && <p className="text-xs text-red-400 mt-3 whitespace-pre-wrap">{trainError}</p>}
    </div>
  );
}

/**
 * localModel.ts — حلقهٔ یادگیری محلی حرفه‌ای
 * آموزش چندوظیفه‌ای (MSE امتیازها + BCE تشخیص‌ها)، نرمال‌سازی فیچر،
 * early stopping، split بر اساس مشتری، hold-out، و oversampling متخصص.
 *
 * فاز ۶: آزمایش مشروط v4 = تصویر + پرسشنامه.
 * مدل فعال فقط وقتی به v4 ارتقا می‌یابد که روی holdout مبتنی بر مشتری
 * از مدل تصویر-فقط همان مجموعه بهتر شود؛ در غیر این صورت v3 می‌ماند.
 */
import * as tf from '@tensorflow/tfjs';
import type { TrainingSample, LocalModelMetadata } from '../db';
import { SYSTEM_TRAINING_POOL_CLIENT_ID } from './systemTrainingPool';
import { OBSERVATION_IDS, normalizeObservationIds, type ObservationId } from './diagnosisCatalog';
import {
  FEATURE_VERSION,
  LEGACY_FEATURE_VERSIONS,
  FEATURE_KEYS,
  featureVectorToArray,
  type ScalpHeuristicScores,
  type ScalpRawMetrics,
} from './scalpFeatures';
import {
  EARLY_STOP_PATIENCE,
  HOLDOUT_CLIENT_RATIO,
  MIN_QUALITY_SAMPLES,
  MIN_SAMPLES_TO_TRAIN,
  MODEL_ARCHITECTURE,
  REPEATED_HOLDOUT_RUNS,
  RETRAIN_F1_TOLERANCE,
  RETRAIN_MAE_TOLERANCE,
  TRAIN_EPOCHS,
  VAL_CLIENT_RATIO,
} from './localModelConstants';
import {
  FEATURE_VERSION_WITH_QUESTIONNAIRE,
  MIN_QUESTIONNAIRE_CLIENTS_FOR_V4,
  MIN_QUESTIONNAIRE_SAMPLES_FOR_V4,
  hasUsableQuestionnaireFeatures,
  questionnaireFeatureSize,
  zeroQuestionnaireFeatures,
} from './questionnaireMlFeatures';
import { assessOutOfDistribution, type OodAssessment } from './outOfDistribution';
import {
  artifactsToBundle,
  bundleToArtifacts,
  isValidModelBundle,
  type LocalModelBackupBundle,
} from './modelBundle';
import {
  calibrateThresholds,
  computeClassificationSummary,
  computeLabelSupport,
  computePositiveClassWeights,
  inactiveLabelIds,
  summarizeRepeatedRuns,
  computeConfidenceInterval,
  computeScoreMetrics,
  computeCalibrationMetrics,
  type ClassificationSummary,
  type LabelSupport,
  type RepeatedMetricSummary,
  type ScoreMetric,
  type ConfidenceInterval,
  type CalibrationSummary,
} from './mlEvaluation';

export {
  MIN_SAMPLES_TO_TRAIN,
  MIN_QUALITY_SAMPLES,
  MODEL_ARCHITECTURE,
  RETRAIN_MAE_TOLERANCE,
  RETRAIN_F1_TOLERANCE,
} from './localModelConstants';

export {
  MIN_POSITIVE_SUPPORT,
  computeLabelSupport,
  computeClassificationSummary,
  calibrateThresholds,
} from './mlEvaluation';
export type { LabelSupport, PerClassMetric, ClassificationSummary, ScoreMetric, ConfidenceInterval, CalibrationSummary } from './mlEvaluation';

export {
  FEATURE_VERSION_WITH_QUESTIONNAIRE,
  MIN_QUESTIONNAIRE_SAMPLES_FOR_V4,
  MIN_QUESTIONNAIRE_CLIENTS_FOR_V4,
} from './questionnaireMlFeatures';

const MODEL_STORAGE_URL = 'indexeddb://scalpai-local-model';
/** فاز ۰٫۵ — نسخهٔ پشتیبان مدل قبلی برای بازگردانی (rollback) */
const MODEL_BACKUP_URL = 'indexeddb://scalpai-local-model-backup';
const SCORE_KEYS: (keyof ScalpHeuristicScores)[] = [
  'oiliness', 'dryness', 'dandruff', 'redness', 'densityScore',
  'shine', 'patchiness', 'pigmentation', 'hairThickness',
];
const SCORE_COUNT = SCORE_KEYS.length;
const OUTPUT_SIZE = SCORE_COUNT + OBSERVATION_IDS.length;
const OBS_THRESHOLD = 0.45;
const IMAGE_FEATURE_DIM = FEATURE_KEYS.length;
/** حاشیهٔ نویز برای اعلام برتری holdout — جلوگیری از ارتقای تصادفی */
const V4_MAE_MARGIN = 0.25;
const V4_F1_MARGIN = 0.02;

type FeatureMode = 'v3' | 'v4';

export interface LocalModelSplitSummary {
  mode: 'client' | 'sample';
  clientCount: number;
  trainClientCount: number;
  validationClientCount: number;
  holdoutClientCount: number;
  trainSampleCount: number;
  validationSampleCount: number;
  holdoutSampleCount: number;
}

export interface LocalModelTrainOptions {
  /** Seed for reproducible client/sample splitting. */
  seed?: number;
  /** فاز ۲٫۴ — رد کردن اجراهای تکراری ارزیابی (برای آموزش سریع/تست) */
  skipRepeatedEvaluation?: boolean;
  /** فاز ۰٫۱ — متریک مدل فعال فعلی برای گیت champion/challenger */
  activeBaseline?: ActiveModelBaseline | null;
  /** فاز ۰٫۱ — جایگزینی اجباری حتی در صورت افت کیفیت (تصمیم آگاهانهٔ کاربر) */
  forceReplace?: boolean;
}

function stableTrainingSeed(samples: TrainingSample[]): number {
  let hash = 2166136261;
  const source = [...samples]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(s => `${s.id}:${s.clientId || ''}:${s.featureVersion || ''}`)
    .join('|');
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

let cachedModel: tf.LayersModel | null = null;
let cachedModelFeatureVersion: string | null = null;
let cachedNorm: { means: number[]; stds: number[] } | null = null;

export function setCachedFeatureNorm(norm: { means: number[]; stds: number[] } | null) {
  cachedNorm = norm;
}

/**
 * فاز ۲٫۲ + ۲٫۳ — آستانه‌های کالیبره و فهرست برچسب‌های سرکوب‌شده.
 * از متادیتای مدل خوانده و پیش از پیش‌بینی تزریق می‌شود.
 */
let cachedObsThresholds: number[] | null = null;
let cachedSuppressedLabels: Set<string> = new Set();

export function setCachedObsPolicy(policy: {
  thresholds?: number[] | null;
  suppressedLabels?: string[] | null;
} | null) {
  cachedObsThresholds = policy?.thresholds?.length === OBSERVATION_IDS.length
    ? policy.thresholds
    : null;
  cachedSuppressedLabels = new Set(policy?.suppressedLabels ?? []);
}

export function getCachedObsPolicy() {
  return {
    thresholds: cachedObsThresholds,
    suppressedLabels: [...cachedSuppressedLabels],
  };
}

export function getCachedFeatureNorm() {
  return cachedNorm;
}

export function getCachedModelFeatureVersion() {
  return cachedModelFeatureVersion;
}

/** آیا نسخهٔ فیچر مدل ذخیره‌شده با یکی از دو نسخهٔ قابل‌استفادهٔ فعلی سازگار است؟ */
export function isActiveLocalModelVersion(version?: string | null): boolean {
  return version === FEATURE_VERSION || version === FEATURE_VERSION_WITH_QUESTIONNAIRE;
}

/** آیا نمونه برای آموزش باکیفیت واجد شرایط است؟ (فیچر تصویر = FEATURE_VERSION فعلی یا نسخهٔ legacy مجاز) */
export function isSampleEligibleForTraining(s: TrainingSample): boolean {
  if (s.featureVersion && s.featureVersion !== FEATURE_VERSION && !LEGACY_FEATURE_VERSIONS.includes(s.featureVersion as typeof LEGACY_FEATURE_VERSIONS[number])) return false;
  if (s.labelSource === 'expert') return true;
  if (s.labelSource === 'online_ai') return s.approvedForTraining === true;
  return false;
}

export function selectTrainingPool(samples: TrainingSample[]): TrainingSample[] {
  return samples.filter(isSampleEligibleForTraining);
}

export interface QuestionnaireV4Gate {
  eligible: boolean;
  sampleCount: number;
  clientCount: number;
  samples: TrainingSample[];
  reason: string;
}

/** حد نصاب نمونه‌ها/مشتری‌های دارای پرسشنامه برای شروع آزمایش v4 */
export function assessQuestionnaireV4Gate(samples: TrainingSample[]): QuestionnaireV4Gate {
  const pool = selectTrainingPool(samples).filter(s =>
    !!s.clientId
    && s.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID
    && hasUsableQuestionnaireFeatures(s.questionnaireFeatures),
  );
  const clients = new Set(pool.map(s => s.clientId || `anon-${s.id}`));
  const sampleCount = pool.length;
  const clientCount = clients.size;
  if (sampleCount < MIN_QUESTIONNAIRE_SAMPLES_FOR_V4) {
    return {
      eligible: false,
      sampleCount,
      clientCount,
      samples: pool,
      reason: `نیاز به حداقل ${MIN_QUESTIONNAIRE_SAMPLES_FOR_V4} نمونهٔ دارای پرسشنامه (فعلاً ${sampleCount}).`,
    };
  }
  if (clientCount < MIN_QUESTIONNAIRE_CLIENTS_FOR_V4) {
    return {
      eligible: false,
      sampleCount,
      clientCount,
      samples: pool,
      reason: `نیاز به حداقل ${MIN_QUESTIONNAIRE_CLIENTS_FOR_V4} مشتری متمایز با پرسشنامه (فعلاً ${clientCount}).`,
    };
  }
  return {
    eligible: true,
    sampleCount,
    clientCount,
    samples: pool,
    reason: 'حد نصاب برقرار است؛ آزمایش holdout اجرا می‌شود.',
  };
}

function buildModel(inputSize: number, positiveWeights?: number[]): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [inputSize],
    units: 48,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
  }));
  model.add(tf.layers.dropout({ rate: 0.25 }));
  model.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
  }));
  model.add(tf.layers.dropout({ rate: 0.15 }));
  model.add(tf.layers.dense({ units: OUTPUT_SIZE, activation: 'sigmoid' }));

  /**
   * فاز ۲٫۵ — BCE وزن‌دار به‌ازای کلاس.
   * قبلاً همهٔ ۷۵ برچسب وزن یکسان داشتند؛ چون اکثرشان بسیار نادرند، مدل
   * می‌آموخت همیشه «منفی» بگوید و همچنان loss پایینی داشته باشد. وزن‌دهی
   * به نمونه‌های مثبت این تعادل را اصلاح می‌کند.
   */
  // عمداً داخل tidy ساخته می‌شود تا نشتی حافظه نداشته باشیم؛ تنسور ۱×۷۵ است
  // و هزینهٔ ساختش در برابر هزینهٔ forward/backward ناچیز است.
  const posWeights = positiveWeights?.length === OBSERVATION_IDS.length
    ? positiveWeights
    : null;

  const multiTaskLoss = (yTrue: tf.Tensor, yPred: tf.Tensor) =>
    tf.tidy(() => {
      const scoreTrue = yTrue.slice([0, 0], [-1, SCORE_COUNT]);
      const scorePred = yPred.slice([0, 0], [-1, SCORE_COUNT]);
      const obsTrue = yTrue.slice([0, SCORE_COUNT], [-1, OBSERVATION_IDS.length]);
      const obsPred = yPred.slice([0, SCORE_COUNT], [-1, OBSERVATION_IDS.length]);
      const mse = tf.losses.meanSquaredError(scoreTrue, scorePred);

      // فاز ۳٫۱ — پیاده‌سازی Focal Loss جهت تمرکز روی نمونه‌های تشخیصی نادر بالینی
      const gamma = 2.0;
      const eps = 1e-7;
      const p = tf.clipByValue(obsPred, eps, 1.0 - eps);

      // محاسبات پویای ترم‌های مثبت و منفی بر اساس تعدیل‌کننده (1 - p_t)^gamma
      const posTerm = tf.mul(
        tf.mul(tf.pow(tf.sub(1.0, p), gamma), tf.log(p)),
        obsTrue
      );
      const negTerm = tf.mul(
        tf.mul(tf.pow(p, gamma), tf.log(tf.sub(1.0, p))),
        tf.sub(1.0, obsTrue)
      );

      const weightedPos = posWeights
        ? tf.mul(posTerm, tf.tensor2d([posWeights]))
        : posTerm;

      const focalLoss = tf.mean(tf.neg(tf.add(weightedPos, negTerm)));
      return tf.add(mse, tf.mul(focalLoss, 0.6));
    });

  model.compile({ optimizer: tf.train.adam(0.008), loss: multiTaskLoss });
  return model;
}

function modelOutputSize(model: tf.LayersModel): number {
  const shape = model.outputs[0]?.shape;
  const last = shape?.[shape.length - 1];
  return typeof last === 'number' ? last : -1;
}

function modelInputSize(model: tf.LayersModel): number {
  const shape = model.inputs[0]?.shape;
  const last = shape?.[shape.length - 1];
  return typeof last === 'number' ? last : -1;
}

function featureVersionFromInputSize(inputSize: number): string | null {
  if (inputSize === IMAGE_FEATURE_DIM) return FEATURE_VERSION;
  if (inputSize === IMAGE_FEATURE_DIM + questionnaireFeatureSize()) {
    return FEATURE_VERSION_WITH_QUESTIONNAIRE;
  }
  return null;
}

function sampleToXY(sample: TrainingSample, mode: FeatureMode): { x: number[]; y: number[] } {
  const imageX = featureVectorToArray(sample.features);
  let x = imageX;
  if (mode === 'v4') {
    const q = hasUsableQuestionnaireFeatures(sample.questionnaireFeatures)
      ? sample.questionnaireFeatures!
      : zeroQuestionnaireFeatures();
    x = [...imageX, ...q];
  }
  const scoreY = SCORE_KEYS.map((key) => {
    const raw = sample.label[key];
    const v = typeof raw === 'number' ? raw : 0;
    return Math.max(0, Math.min(100, v)) / 100;
  });
  const fromObs = normalizeObservationIds(sample.label.observations);
  const fromLesions = normalizeObservationIds(
    (sample.label.lesions ?? []).map((l) => l.type),
  );
  const obsSet = new Set<ObservationId>([...fromObs, ...fromLesions]);
  const obsY = OBSERVATION_IDS.map((id) => (obsSet.has(id) ? 1 : 0));
  return { x, y: [...scoreY, ...obsY] };
}

function computeNorm(xs: number[][]): { means: number[]; stds: number[] } {
  if (xs.length === 0) return { means: [], stds: [] };
  const dim = xs[0].length;
  const means = new Array(dim).fill(0);
  // باید از ۰ شروع شود؛ fill(1) قبلاً به هر بُعد +۱ داخل sum-of-squares اضافه می‌کرد
  // و نرمال‌سازی را سیستماتیک منحرف می‌کرد.
  const stds = new Array(dim).fill(0);
  for (const row of xs) {
    for (let i = 0; i < dim; i++) means[i] += row[i];
  }
  for (let i = 0; i < dim; i++) means[i] /= xs.length;
  for (const row of xs) {
    for (let i = 0; i < dim; i++) {
      const d = row[i] - means[i];
      stds[i] += d * d;
    }
  }
  for (let i = 0; i < dim; i++) {
    stds[i] = Math.sqrt(stds[i] / Math.max(1, xs.length)) || 1;
    if (stds[i] < 1e-6) stds[i] = 1;
  }
  return { means, stds };
}

function applyNorm(x: number[], means: number[], stds: number[]): number[] {
  return x.map((v, i) => (v - (means[i] ?? 0)) / (stds[i] ?? 1));
}

function shuffleInPlace<T>(arr: T[], seed = Date.now()): T[] {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * تقسیم بر اساس مشتری تا نشت بین train/val/holdout کمتر شود.
 * با مشتری کم (مثلاً ۱ کلینیک تک‌کاربره) تضمین می‌کند train خالی نباشد —
 * قبلاً nVal=max(1,…) همهٔ نمونه‌ها را به val می‌فرستاد و fit کرش می‌کرد.
 */
function splitByClient(
  samples: TrainingSample[],
  valRatio: number,
  holdoutRatio: number,
  seed = Date.now(),
): { train: TrainingSample[]; val: TrainingSample[]; holdout: TrainingSample[]; summary: LocalModelSplitSummary } {
  const byClient = new Map<string, TrainingSample[]>();
  for (const s of samples) {
    const key = s.clientId || `anon-${s.id}`;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(s);
  }
  const clients = shuffleInPlace([...byClient.keys()], seed);

  // با کمتر از ۳ مشتری، تقسیم client-level عملاً همه را به val می‌برد؛
  // به split نمونه‌ای برمی‌گردیم تا train همیشه غیرخالی بماند.
  if (clients.length < 3) {
    const shuffled = shuffleInPlace([...samples], seed);
    // بدون حداقل سه مشتری، hold-out مستقل معتبر نداریم؛ هیچ نمونه‌ای
    // برای hold-out کنار گذاشته نمی‌شود و فقط validation نمونه‌ای داریم.
    const nHold = 0;
    const remaining = shuffled.length - nHold;
    const nVal = Math.min(
      Math.max(1, Math.floor(remaining * valRatio)),
      Math.max(1, remaining - 1),
    );
    const val = shuffled.slice(nHold, nHold + nVal);
    const train = shuffled.slice(nHold + nVal);
    if (train.length === 0 && val.length > 1) {
      train.push(val.pop()!);
    }
    return {
      train,
      val,
      holdout: [],
      summary: {
        mode: 'sample',
        clientCount: clients.length,
        trainClientCount: new Set(train.map(s => s.clientId)).size,
        validationClientCount: new Set(val.map(s => s.clientId)).size,
        holdoutClientCount: 0,
        trainSampleCount: train.length,
        validationSampleCount: val.length,
        holdoutSampleCount: 0,
      },
    };
  }

  // حداقل یک مشتری برای train نگه دار؛ برای ارزیابی معتبر حداقل یک
  // مشتری مستقل در validation و holdout نگه می‌داریم.
  const maxHold = Math.max(0, clients.length - 2);
  const nHold = Math.min(Math.max(1, Math.floor(clients.length * holdoutRatio)), maxHold);
  const afterHold = clients.length - nHold;
  const maxVal = Math.max(0, afterHold - 1);
  const nVal = Math.min(Math.max(1, Math.floor(clients.length * valRatio)), maxVal);

  const holdClients = new Set(clients.slice(0, nHold));
  const valClients = new Set(clients.slice(nHold, nHold + nVal));
  const train: TrainingSample[] = [];
  const val: TrainingSample[] = [];
  const holdout: TrainingSample[] = [];
  for (const [cid, list] of byClient) {
    if (holdClients.has(cid)) holdout.push(...list);
    else if (valClients.has(cid)) val.push(...list);
    else train.push(...list);
  }
  // اگر val خالی شد، از train جدا کن (بدون خالی کردن train)
  if (val.length === 0 && train.length >= 5) {
    const moved = train.splice(0, Math.max(1, Math.floor(train.length * 0.2)));
    val.push(...moved);
  }
  if (train.length === 0 && val.length > 0) {
    train.push(...val.splice(0, Math.ceil(val.length / 2)));
  }
  const clientOf = (sample: TrainingSample) => sample.clientId || `anon-${sample.id}`;
  return {
    train,
    val,
    holdout,
    summary: {
      mode: 'client',
      clientCount: clients.length,
      trainClientCount: new Set(train.map(clientOf)).size,
      validationClientCount: new Set(val.map(clientOf)).size,
      holdoutClientCount: new Set(holdout.map(clientOf)).size,
      trainSampleCount: train.length,
      validationSampleCount: val.length,
      holdoutSampleCount: holdout.length,
    },
  };
}

export interface KFoldSplit {
  train: TrainingSample[];
  val: TrainingSample[];
  holdout: TrainingSample[];
}

export function splitByClientKFold(
  samples: TrainingSample[],
  k = 5,
  seed = Date.now(),
): KFoldSplit[] {
  const byClient = new Map<string, TrainingSample[]>();
  for (const s of samples) {
    const key = s.clientId || `anon-${s.id}`;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(s);
  }
  const clients = shuffleInPlace([...byClient.keys()], seed);

  const actualK = Math.min(k, clients.length);
  if (actualK < 3) {
    const shuffled = shuffleInPlace([...samples], seed);
    const nVal = Math.max(1, Math.floor(shuffled.length * 0.2));
    const val = shuffled.slice(0, nVal);
    const train = shuffled.slice(nVal);
    return [{ train, val, holdout: val }];
  }

  const clientFolds: string[][] = Array.from({ length: actualK }, () => []);
  for (let i = 0; i < clients.length; i++) {
    clientFolds[i % actualK].push(clients[i]);
  }

  const folds: KFoldSplit[] = [];
  for (let i = 0; i < actualK; i++) {
    const holdoutClients = new Set(clientFolds[i]);
    const valClients = new Set(clientFolds[(i + 1) % actualK]);

    const train: TrainingSample[] = [];
    const val: TrainingSample[] = [];
    const holdout: TrainingSample[] = [];

    for (const [cid, list] of byClient) {
      if (holdoutClients.has(cid)) {
        holdout.push(...list);
      } else if (valClients.has(cid)) {
        val.push(...list);
      } else {
        train.push(...list);
      }
    }

    folds.push({ train, val, holdout });
  }

  return folds;
}

function oversampleExperts(samples: TrainingSample[]): TrainingSample[] {
  const out: TrainingSample[] = [];
  for (const s of samples) {
    out.push(s);
    if (s.labelSource === 'expert') out.push(s);
  }
  return out;
}

function maeScores(yTrue: number[][], yPred: number[][]): number {
  if (!yTrue.length) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < yTrue.length; i++) {
    for (let k = 0; k < SCORE_COUNT; k++) {
      sum += Math.abs((yTrue[i][k] ?? 0) - (yPred[i][k] ?? 0));
      n++;
    }
  }
  return n ? (sum / n) * 100 : 0; // به مقیاس ۰–۱۰۰
}

function obsF1(yTrue: number[][], yPred: number[][], thr = OBS_THRESHOLD): number {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    for (let k = SCORE_COUNT; k < OUTPUT_SIZE; k++) {
      const t = (yTrue[i][k] ?? 0) >= 0.5;
      const p = (yPred[i][k] ?? 0) >= thr;
      if (p && t) tp++;
      else if (p && !t) fp++;
      else if (!p && t) fn++;
    }
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  return prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
}

async function predictRows(
  model: tf.LayersModel,
  xs: number[][],
): Promise<number[][]> {
  if (!xs.length) return [];
  const t = tf.tensor2d(xs);
  const out = model.predict(t) as tf.Tensor;
  const data = Array.from(await out.data());
  t.dispose();
  out.dispose();
  const rows: number[][] = [];
  for (let i = 0; i < xs.length; i++) {
    rows.push(data.slice(i * OUTPUT_SIZE, (i + 1) * OUTPUT_SIZE));
  }
  return rows;
}

interface FitMetrics {
  loss: number;
  valLoss?: number;
  epochs: number;
  maeScores: number;
  valMaeScores?: number;
  obsF1: number;
  valObsF1?: number;
  holdoutMae?: number;
  holdoutObsF1?: number;
  /** فاز ۲٫۳ — آستانهٔ کالیبره‌شده به‌ازای هر برچسب */
  obsThresholds?: number[];
  /** فاز ۲٫۱ — F1 ماکرو روی holdout (صادقانه‌تر از میکرو) */
  holdoutMacroF1?: number;
  /** فاز ۲٫۱ — گزارش کامل per-class روی holdout */
  holdoutPerClass?: ClassificationSummary;
}

interface FitOutcome {
  model: tf.LayersModel;
  norm: { means: number[]; stds: number[] };
  metrics: FitMetrics;
  holdoutTrue?: number[][];
  holdoutPred?: number[][];
}

async function fitOnSplit(
  train: TrainingSample[],
  val: TrainingSample[],
  holdout: TrainingSample[],
  mode: FeatureMode,
  onEpoch?: (epoch: number, logs: TrainProgressLogs) => void,
): Promise<FitOutcome> {
  if (train.length === 0) {
    throw new Error('مجموعهٔ آموزش خالی است؛ نمونه‌های بیشتری از مشتریان مختلف لازم است.');
  }
  const trainExp = oversampleExperts(train);
  const trainRows = trainExp.map(s => sampleToXY(s, mode));
  const valRows = val.map(s => sampleToXY(s, mode));
  const holdRows = holdout.map(s => sampleToXY(s, mode));

  const norm = computeNorm(trainRows.map(r => r.x));
  const valX = valRows.map(r => applyNorm(r.x, norm.means, norm.stds));
  const holdX = holdRows.map(r => applyNorm(r.x, norm.means, norm.stds));

  const trainX: number[][] = [];
  const augmentedTrainRows: typeof trainRows = [];
  for (let i = 0; i < trainRows.length; i++) {
    const normX = applyNorm(trainRows[i].x, norm.means, norm.stds);
    trainX.push(normX);
    augmentedTrainRows.push(trainRows[i]);

    // فاز ۵٫۴ — فرآیند Augmentation محافظه‌کارانه فقط برای نمونه‌های متخصص در بخش آموزش
    if (trainExp[i].labelSource === 'expert') {
      const augmentedX = normX.map(v => {
        const noise = (Math.random() - 0.5) * 2 * 0.03;
        return v + noise;
      });
      trainX.push(augmentedX);
      augmentedTrainRows.push(trainRows[i]);
    }
  }

  const xsT = tf.tensor2d(trainX);
  const ysT = tf.tensor2d(augmentedTrainRows.map(r => r.y));
  const valXs = valX.length ? tf.tensor2d(valX) : null;
  const valYs = valRows.length ? tf.tensor2d(valRows.map(r => r.y)) : null;

  // فاز ۲٫۵ — وزن کلاس از روی توزیع واقعی بخش آموزش (نه کل دیتاست، تا نشت
  // اطلاعات از validation/holdout رخ ندهد)
  const obsTrainMatrix = augmentedTrainRows.map(r => r.y.slice(SCORE_COUNT));
  const positiveWeights = computePositiveClassWeights(obsTrainMatrix, OBSERVATION_IDS.length);

  const model = buildModel(trainX[0].length, positiveWeights);

  let bestVal = Infinity;
  let patience = 0;
  const bestWeightsBox: { weights: tf.Tensor[] | null } = { weights: null };
  let epochsRun = 0;

  try {
    const history = await model.fit(xsT, ysT, {
      epochs: TRAIN_EPOCHS,
      batchSize: Math.min(16, Math.max(4, trainX.length)),
      shuffle: true,
      validationData: valXs && valYs ? [valXs, valYs] : undefined,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          epochsRun = epoch + 1;
          const v = typeof logs?.val_loss === 'number' ? logs.val_loss : logs?.loss ?? Infinity;
          if (v + 1e-4 < bestVal) {
            bestVal = v;
            patience = 0;
            if (bestWeightsBox.weights) bestWeightsBox.weights.forEach(w => w.dispose());
            bestWeightsBox.weights = model.getWeights().map(w => w.clone());
          } else {
            patience += 1;
            if (patience >= EARLY_STOP_PATIENCE) {
              model.stopTraining = true;
            }
          }
          onEpoch?.(epoch + 1, {
            epoch: epoch + 1,
            loss: logs?.loss,
            val_loss: logs?.val_loss,
          });
          /**
           * فاز ۴٫۴ — واگذاری کنترل به حلقهٔ رویداد در پایان هر epoch.
           *
           * بدون این، آموزش رشتهٔ اصلی را تا انتها قفل می‌کند و UI (از جمله
           * نوار پیشرفت همین آموزش) فریز می‌شود. با فاز ۲ که ارزیابی تکراری
           * اضافه شد، مدت آموزش چند برابر شد و مسئله جدی‌تر است.
           *
           * چرا Web Worker نه؟ انتقال TF.js به worker نیازمند جابه‌جایی
           * ذخیره/بارگذاری مدل روی IndexedDB و کل مسیر متادیتا به آن سوی
           * مرز worker است — تغییری پرریسک که بدون داشتن معیار عملکردی
           * واقعی توجیه نمی‌شود. tf.nextFrame همان مشکل محسوس کاربر را با
           * چند خط و بدون تغییر معماری حل می‌کند.
           */
          await tf.nextFrame();
        },
      },
    });

    if (bestWeightsBox.weights) {
      model.setWeights(bestWeightsBox.weights);
      bestWeightsBox.weights.forEach((w) => w.dispose());
      bestWeightsBox.weights = null;
    }

    const trainPred = await predictRows(model, trainX);
    const valPred = valX.length ? await predictRows(model, valX) : [];
    const holdPred = holdX.length ? await predictRows(model, holdX) : [];

    const lossArr = history.history.loss as number[];
    const valLossArr = history.history.val_loss as number[] | undefined;

    // فاز ۲٫۳ — آستانه‌ها روی validation کالیبره می‌شوند (نه روی holdout،
    // وگرنه holdout دیگر بی‌طرف نیست و متریک خوش‌بینانه می‌شود)
    const obsSlice = (rows: number[][]) => rows.map(r => r.slice(SCORE_COUNT));
    const obsThresholds = valRows.length
      ? calibrateThresholds(
        obsSlice(valRows.map(r => r.y)),
        obsSlice(valPred),
        OBSERVATION_IDS.length,
        OBS_THRESHOLD,
      )
      : new Array(OBSERVATION_IDS.length).fill(OBS_THRESHOLD);

    const holdoutPerClass = holdRows.length
      ? computeClassificationSummary(
        obsSlice(holdRows.map(r => r.y)),
        obsSlice(holdPred),
        OBSERVATION_IDS,
        obsThresholds,
      )
      : undefined;

    return {
      model,
      norm,
      metrics: {
        loss: lossArr[lossArr.length - 1],
        valLoss: valLossArr ? valLossArr[valLossArr.length - 1] : undefined,
        epochs: epochsRun || lossArr.length,
        maeScores: maeScores(augmentedTrainRows.map(r => r.y), trainPred),
        valMaeScores: valRows.length ? maeScores(valRows.map(r => r.y), valPred) : undefined,
        obsF1: obsF1(augmentedTrainRows.map(r => r.y), trainPred),
        valObsF1: valRows.length ? obsF1(valRows.map(r => r.y), valPred) : undefined,
        holdoutMae: holdRows.length ? maeScores(holdRows.map(r => r.y), holdPred) : undefined,
        holdoutObsF1: holdoutPerClass?.microF1,
        holdoutMacroF1: holdoutPerClass?.macroF1,
        holdoutPerClass,
        obsThresholds,
      },
      holdoutTrue: holdRows.length ? holdRows.map(r => r.y) : undefined,
      holdoutPred: holdRows.length ? holdPred : undefined,
    };
  } catch (err) {
    try { model.dispose(); } catch { /* ignore */ }
    throw err;
  } finally {
    xsT.dispose();
    ysT.dispose();
    valXs?.dispose();
    valYs?.dispose();
    if (bestWeightsBox.weights) {
      bestWeightsBox.weights.forEach((w) => w.dispose());
      bestWeightsBox.weights = null;
    }
  }
}

/** v4 فقط اگر MAE بهتر شود و F1 بدتر نشود — یا F1 بهتر شود و MAE بدتر نشود */
function v4BeatsImageOnly(
  imageOnly: { holdoutMae?: number; holdoutObsF1?: number },
  v4: { holdoutMae?: number; holdoutObsF1?: number },
): boolean {
  if (typeof imageOnly.holdoutMae !== 'number' || typeof v4.holdoutMae !== 'number') {
    return false;
  }
  const imageF1 = imageOnly.holdoutObsF1 ?? 0;
  const v4F1 = v4.holdoutObsF1 ?? 0;
  const maeBetter = v4.holdoutMae < imageOnly.holdoutMae - V4_MAE_MARGIN;
  const f1NotWorse = v4F1 + V4_F1_MARGIN >= imageF1;
  const f1Better = v4F1 > imageF1 + V4_F1_MARGIN;
  const maeNotWorse = v4.holdoutMae <= imageOnly.holdoutMae + V4_MAE_MARGIN;
  return (maeBetter && f1NotWorse) || (f1Better && maeNotWorse);
}

/** مرجع مدل فعال فعلی برای مقایسهٔ بازآموزی (از متادیتای ذخیره‌شده می‌آید) */
export interface ActiveModelBaseline {
  version?: number;
  architecture?: string;
  featureVersion?: string;
  holdoutMae?: number;
  holdoutObsF1?: number;
  /** فاز ۲٫۱ — در صورت وجود، معیار ترجیحی مقایسه است (صادقانه‌تر از میکرو) */
  holdoutMacroF1?: number;
}

export interface RetrainGateDecision {
  /** آیا مدل تازه‌آموزش‌دیده باید جایگزین مدل فعال شود؟ */
  shouldReplace: boolean;
  /** آیا اصلاً مقایسه‌ای انجام شد؟ (اگر baseline قابل مقایسه نبود false) */
  compared: boolean;
  /** آیا کاربر با override دستی جایگزینی را اجبار کرد؟ */
  forced: boolean;
  reason: string;
  baselineHoldoutMae?: number;
  baselineHoldoutObsF1?: number;
  candidateHoldoutMae?: number;
  candidateHoldoutObsF1?: number;
}

/**
 * فاز ۰٫۱ — گیت champion/challenger برای بازآموزی هم‌نسخه.
 *
 * پیش از این، هر بار «آموزش» زده می‌شد مدل جدید بدون هیچ مقایسه‌ای جایگزین مدل فعال
 * می‌شد؛ یعنی مدل می‌توانست بی‌سروصدا بدتر شود. اینجا مدل جدید فقط وقتی جایگزین
 * می‌شود که روی holdout به‌طور معنادار بدتر از مدل فعال نباشد.
 *
 * سیاست عمداً «محافظه‌کارانهٔ ملایم» است: کاندید لازم نیست بهتر باشد (چون دیتاست
 * بین دو آموزش رشد می‌کند و holdoutها یکسان نیستند)، فقط نباید بیش از حاشیهٔ
 * تحمل بدتر باشد. مقایسهٔ سخت‌گیرانه‌تر (repeated holdout) به فاز ۲ موکول است.
 */
export function evaluateRetrainGate(
  baseline: ActiveModelBaseline | null | undefined,
  candidate: {
    holdoutMae?: number;
    holdoutObsF1?: number;
    holdoutMacroF1?: number;
    featureVersion: string;
  },
  options: { force?: boolean } = {},
): RetrainGateDecision {
  const base = {
    baselineHoldoutMae: baseline?.holdoutMae,
    baselineHoldoutObsF1: baseline?.holdoutObsF1,
    candidateHoldoutMae: candidate.holdoutMae,
    candidateHoldoutObsF1: candidate.holdoutObsF1,
  };

  if (options.force) {
    return {
      ...base,
      shouldReplace: true,
      compared: false,
      forced: true,
      reason: 'جایگزینی دستی توسط کاربر اجبار شد (بدون اعمال گیت کیفیت).',
    };
  }

  if (!baseline || typeof baseline.holdoutMae !== 'number') {
    return {
      ...base,
      shouldReplace: true,
      compared: false,
      forced: false,
      reason: 'مدل فعال قبلی وجود ندارد یا متریک holdout ثبت‌شده ندارد؛ مدل جدید ذخیره شد.',
    };
  }

  if (baseline.architecture && baseline.architecture !== MODEL_ARCHITECTURE) {
    return {
      ...base,
      shouldReplace: true,
      compared: false,
      forced: false,
      reason: `معماری مدل قبلی (${baseline.architecture}) با معماری فعلی (${MODEL_ARCHITECTURE}) ناسازگار است؛ مقایسه معنا ندارد و مدل جدید ذخیره شد.`,
    };
  }

  if (baseline.featureVersion && baseline.featureVersion !== candidate.featureVersion) {
    return {
      ...base,
      shouldReplace: true,
      compared: false,
      forced: false,
      reason: `نسخهٔ فیچر عوض شده (${baseline.featureVersion} → ${candidate.featureVersion})؛ متریک‌ها قابل مقایسه نیستند و مدل جدید ذخیره شد.`,
    };
  }

  if (typeof candidate.holdoutMae !== 'number') {
    return {
      ...base,
      shouldReplace: false,
      compared: true,
      forced: false,
      reason: 'مدل جدید هیچ متریک holdout تولید نکرد (holdout خالی بود)؛ برای جلوگیری از افت ناشناخته، مدل فعال قبلی نگه داشته شد.',
    };
  }

  /**
   * فاز ۲٫۱ — اگر هر دو طرف F1 ماکرو دارند، همان مبنای مقایسه است؛ چون در
   * دیتاست نامتوازن، F1 میکرو می‌تواند ثابت بماند در حالی که کیفیت روی
   * تشخیص‌های کم‌تکرار فروریخته است.
   */
  const useMacro = typeof baseline.holdoutMacroF1 === 'number'
    && typeof candidate.holdoutMacroF1 === 'number';
  const baseF1 = useMacro ? baseline.holdoutMacroF1! : (baseline.holdoutObsF1 ?? 0);
  const candF1 = useMacro ? candidate.holdoutMacroF1! : (candidate.holdoutObsF1 ?? 0);
  const f1Name = useMacro ? 'F1 ماکرو' : 'F1';
  const maeNotWorse = candidate.holdoutMae <= baseline.holdoutMae + RETRAIN_MAE_TOLERANCE;
  const f1NotWorse = candF1 + RETRAIN_F1_TOLERANCE >= baseF1;

  if (maeNotWorse && f1NotWorse) {
    return {
      ...base,
      shouldReplace: true,
      compared: true,
      forced: false,
      reason: `مدل جدید در holdout افت معناداری نداشت (MAE ${candidate.holdoutMae.toFixed(2)} در برابر ${baseline.holdoutMae.toFixed(2)}؛ ${f1Name} ${candF1.toFixed(3)} در برابر ${baseF1.toFixed(3)}) و جایگزین شد.`,
    };
  }

  const parts: string[] = [];
  if (!maeNotWorse) parts.push(`MAE بدتر شد (${candidate.holdoutMae.toFixed(2)} در برابر ${baseline.holdoutMae.toFixed(2)})`);
  if (!f1NotWorse) parts.push(`${f1Name} بدتر شد (${candF1.toFixed(3)} در برابر ${baseF1.toFixed(3)})`);

  return {
    ...base,
    shouldReplace: false,
    compared: true,
    forced: false,
    reason: `مدل جدید ذخیره نشد چون روی holdout بدتر بود: ${parts.join(' و ')}. مدل فعال قبلی (نسخهٔ ${baseline.version ?? '؟'}) دست‌نخورده ماند. در صورت اطمینان می‌توانید «جایگزینی اجباری» را بزنید.`,
  };
}

export interface TrainResult {
  /** فاز ۲٫۳ — آستانهٔ کالیبره‌شدهٔ هر برچسب (هم‌ترتیب با OBSERVATION_IDS) */
  obsThresholds?: number[];
  /** فاز ۲٫۱ — گزارش per-class روی holdout */
  holdoutPerClass?: ClassificationSummary;
  /** فاز ۲٫۱ — F1 ماکرو (میانگین روی کلاس‌های دارای نمونهٔ مثبت) */
  holdoutMacroF1?: number;
  /** فاز ۲٫۲ — support هر برچسب در استخر آموزشی */
  labelSupport?: LabelSupport[];
  /** فاز ۲٫۲ — برچسب‌هایی که مدل نباید روی آن‌ها اظهارنظر کند */
  suppressedLabels?: string[];
  /** فاز ۲٫۴ — تجمیع چند اجرای holdout با seedهای متفاوت */
  repeatedHoldout?: {
    mae: RepeatedMetricSummary;
    macroF1: RepeatedMetricSummary;
  };
  /** فاز ۱٫۲ — گزارش ارزیابی K-Fold */
  kFoldEvaluation?: {
    mae: ConfidenceInterval;
    macroF1: ConfidenceInterval;
  };
  /** فاز ۱٫۳ — گزارش سنجش کالیبراسیون */
  calibration?: CalibrationSummary;
  /** فاز ۱٫۱ — متریک‌های MAE و R2 برای هر یک از ۹ امتیاز عددی روی holdout */
  scoreMetrics?: ScoreMetric[];
  /** فاز ۰٫۱ — نتیجهٔ گیت مقایسه با مدل فعال قبلی */
  retrainGate: RetrainGateDecision;
  /** اگر false باشد، وزن‌های مدل ذخیره نشدند و مدل فعال قبلی سرجای خود است */
  modelPersisted: boolean;
  loss: number;
  valLoss?: number;
  epochs: number;
  sampleCount: number;
  sampleCountBySource: Record<string, number>;
  maeScores?: number;
  valMaeScores?: number;
  obsF1?: number;
  valObsF1?: number;
  holdoutMae?: number;
  holdoutObsF1?: number;
  featureMeans: number[];
  featureStds: number[];
  architecture: string;
  trainedIds: string[];
  /** نسخهٔ فیچر مدل ذخیره‌شده (v3 یا v4) */
  featureVersion: string;
  seed: number;
  datasetHash: string;
  evaluation: LocalModelSplitSummary;
  v4Experiment: {
    attempted: boolean;
    promoted: boolean;
    reason: string;
    questionnaireSampleCount: number;
    questionnaireClientCount: number;
    imageOnlyHoldoutMae?: number;
    imageOnlyHoldoutObsF1?: number;
    v4HoldoutMae?: number;
    v4HoldoutObsF1?: number;
  };
}

export interface LocalModelPrediction {
  scores: ScalpHeuristicScores;
  observations: ObservationId[];
  /** فاز ۴٫۳ — آیا این تصویر شبیه دادهٔ آموزشی مدل است؟ */
  ood?: OodAssessment;
  /** فاز ۳٫۲ — نمرهٔ عدم‌قطعیت بالینی مبتنی بر MC-Dropout */
  uncertainty?: number;
}

export interface TrainProgressLogs {
  epoch: number;
  loss?: number;
  val_loss?: number;
  mae?: number;
}

/**
 * آموزش مدل محلی حرفه‌ای روی نمونه‌های واجد شرایط.
 * در صورت حد نصاب پرسشنامه، تصویر-فقط و v4 روی همان holdout مقایسه می‌شوند.
 */
export async function trainLocalModel(
  samples: TrainingSample[],
  onEpoch?: (epoch: number, logs: TrainProgressLogs) => void,
  options: LocalModelTrainOptions = {},
): Promise<TrainResult> {
  const pool = selectTrainingPool(samples);
  if (pool.length < MIN_SAMPLES_TO_TRAIN) {
    throw new Error(
      `حداقل ${MIN_SAMPLES_TO_TRAIN} نمونهٔ واجد شرایط لازم است (متخصص یا AI تأییدشده). فعلاً ${pool.length} نمونه واجد شرایط از ${samples.length} کل نمونه.`,
    );
  }
  const qualityCount = pool.filter(
    s => s.labelSource === 'expert' || s.approvedForTraining,
  ).length;
  if (qualityCount < MIN_QUALITY_SAMPLES) {
    throw new Error(
      `حداقل ${MIN_QUALITY_SAMPLES} نمونهٔ متخصص/تأییدشده لازم است (فعلاً ${qualityCount}).`,
    );
  }

  const bySource: Record<string, number> = {};
  for (const s of pool) {
    bySource[s.labelSource] = (bySource[s.labelSource] || 0) + 1;
  }

  const gate = assessQuestionnaireV4Gate(samples);
  const splitSeed = options.seed ?? stableTrainingSeed(pool);
  // همیشه ابتدا مدل تصویر-فقط روی کل استخر واجد شرایط آموزش داده می‌شود
  const fullSplit = splitByClient(pool, VAL_CLIENT_RATIO, HOLDOUT_CLIENT_RATIO, splitSeed);
  const v3Full = await fitOnSplit(
    fullSplit.train,
    fullSplit.val,
    fullSplit.holdout,
    'v3',
    onEpoch,
  );
  let selectedEvaluation = fullSplit.summary;

  /**
   * فاز ۲٫۴ — ارزیابی تکراری با seedهای متفاوت.
   *
   * یک split ثابت می‌تواند خوش‌شانس یا بدشانس باشد؛ با تکرار، هم میانگین و هم
   * پراکندگی گزارش می‌شود تا معلوم باشد عدد چقدر قابل اتکاست.
   * مدل نهایی همان اجرای اصلی است — این اجراها فقط برای *سنجش* هستند و
   * مدل‌هایشان بلافاصله آزاد می‌شود.
   */
  const repeatedMae: (number | undefined)[] = [v3Full.metrics.holdoutMae];
  const repeatedMacro: (number | undefined)[] = [v3Full.metrics.holdoutMacroF1];
  if (!options.skipRepeatedEvaluation) {
    for (let r = 1; r < REPEATED_HOLDOUT_RUNS; r++) {
      const altSeed = splitSeed + r * 7919;
      const altSplit = splitByClient(pool, VAL_CLIENT_RATIO, HOLDOUT_CLIENT_RATIO, altSeed);
      if (!altSplit.train.length || !altSplit.holdout.length) continue;
      let altFit: FitOutcome | null = null;
      try {
        altFit = await fitOnSplit(altSplit.train, altSplit.val, altSplit.holdout, 'v3');
        repeatedMae.push(altFit.metrics.holdoutMae);
        repeatedMacro.push(altFit.metrics.holdoutMacroF1);
      } catch {
        // یک اجرای ناموفق نباید کل آموزش را از کار بیندازد
      } finally {
        if (altFit) { try { altFit.model.dispose(); } catch { /* ignore */ } }
      }
    }
  }

  let active = v3Full;
  let featureVersion = FEATURE_VERSION;
  const v4Experiment: TrainResult['v4Experiment'] = {
    attempted: false,
    promoted: false,
    reason: gate.reason,
    questionnaireSampleCount: gate.sampleCount,
    questionnaireClientCount: gate.clientCount,
  };

  if (gate.eligible) {
    v4Experiment.attempted = true;
    // همان تقسیم مشتری برای هر دو بازوی آزمایش — تا مقایسه منصفانه باشد
    const qSplit = splitByClient(
      gate.samples,
      VAL_CLIENT_RATIO,
      HOLDOUT_CLIENT_RATIO,
      splitSeed + 17,
    );
    if (qSplit.holdout.length === 0) {
      v4Experiment.reason = 'holdout پرسشنامه خالی بود؛ v4 ارتقا نیافت و مدل تصویر-فقط نگه داشته شد.';
    } else {
      let imageOnlyExp: FitOutcome | null = null;
      let v4Exp: FitOutcome | null = null;
      try {
        imageOnlyExp = await fitOnSplit(
          qSplit.train,
          qSplit.val,
          qSplit.holdout,
          'v3',
          onEpoch,
        );
        v4Exp = await fitOnSplit(
          qSplit.train,
          qSplit.val,
          qSplit.holdout,
          'v4',
          onEpoch,
        );
        v4Experiment.imageOnlyHoldoutMae = imageOnlyExp.metrics.holdoutMae;
        v4Experiment.imageOnlyHoldoutObsF1 = imageOnlyExp.metrics.holdoutObsF1;
        v4Experiment.v4HoldoutMae = v4Exp.metrics.holdoutMae;
        v4Experiment.v4HoldoutObsF1 = v4Exp.metrics.holdoutObsF1;

        if (v4BeatsImageOnly(imageOnlyExp.metrics, v4Exp.metrics)) {
          v4Experiment.promoted = true;
          v4Experiment.reason =
            `v4 روی holdout بهتر بود (MAE ${v4Exp.metrics.holdoutMae?.toFixed(2)} در برابر ${imageOnlyExp.metrics.holdoutMae?.toFixed(2)}؛ F1 ${v4Exp.metrics.holdoutObsF1?.toFixed(3)} در برابر ${imageOnlyExp.metrics.holdoutObsF1?.toFixed(3)}).`;
          try { v3Full.model.dispose(); } catch { /* ignore */ }
          try { imageOnlyExp.model.dispose(); } catch { /* ignore */ }
          active = v4Exp;
          selectedEvaluation = qSplit.summary;
          featureVersion = FEATURE_VERSION_WITH_QUESTIONNAIRE;
          imageOnlyExp = null;
          v4Exp = null;
        } else {
          v4Experiment.reason =
            `v4 برتری holdout نداشت (MAE ${v4Exp.metrics.holdoutMae?.toFixed(2)} در برابر تصویر-فقط ${imageOnlyExp.metrics.holdoutMae?.toFixed(2)})؛ مدل v3 نگه داشته شد.`;
          try { imageOnlyExp.model.dispose(); } catch { /* ignore */ }
          try { v4Exp.model.dispose(); } catch { /* ignore */ }
          imageOnlyExp = null;
          v4Exp = null;
        }
      } catch (err) {
        if (imageOnlyExp) try { imageOnlyExp.model.dispose(); } catch { /* ignore */ }
        if (v4Exp) try { v4Exp.model.dispose(); } catch { /* ignore */ }
        v4Experiment.reason = `آزمایش v4 ناموفق بود؛ مدل تصویر-فقط نگه داشته شد. (${(err as Error).message})`;
      }
    }
  }

  // فاز ۰٫۱ — قبل از ذخیره، مدل کاندید را با مدل فعال فعلی مقایسه کن
  const retrainGate = evaluateRetrainGate(
    options.activeBaseline,
    {
      holdoutMae: active.metrics.holdoutMae,
      holdoutObsF1: active.metrics.holdoutObsF1,
      holdoutMacroF1: active.metrics.holdoutMacroF1,
      featureVersion,
    },
    { force: options.forceReplace },
  );

  let modelPersisted = false;
  if (retrainGate.shouldReplace) {
    // فاز ۰٫۵ — قبل از بازنویسی، نسخهٔ فعلی را به‌عنوان پشتیبان نگه دار
    try {
      await tf.io.copyModel(MODEL_STORAGE_URL, MODEL_BACKUP_URL);
    } catch {
      /* مدل قبلی وجود ندارد — پشتیبان لازم نیست */
    }
    try {
      await active.model.save(MODEL_STORAGE_URL);
      modelPersisted = true;
    } catch (err) {
      try { active.model.dispose(); } catch { /* ignore */ }
      throw err;
    }

    if (cachedModel && cachedModel !== active.model) {
      try { cachedModel.dispose(); } catch { /* ignore */ }
    }
    cachedModel = active.model;
    cachedModelFeatureVersion = featureVersion;
    cachedNorm = active.norm;
  } else {
    // مدل رد شد — وزن‌ها ذخیره نمی‌شوند و کش دست‌نخورده می‌ماند
    try { active.model.dispose(); } catch { /* ignore */ }
  }

  // فاز ۲٫۲ — support برچسب‌ها روی کل استخر آموزشی
  const labelSupport = computeLabelSupport(
    pool.map(s => sampleToXY(s, 'v3').y.slice(SCORE_COUNT)),
    OBSERVATION_IDS,
  );

  // فاز ۱٫۲ — اعتبارسنجی K-Fold بر اساس مشتری (K=5)
  const kFoldMaes: number[] = [];
  const kFoldMacroF1s: number[] = [];

  const folds = splitByClientKFold(pool, 5, splitSeed);
  for (const fold of folds) {
    if (!fold.train.length || !fold.holdout.length) continue;
    let foldFit: FitOutcome | null = null;
    try {
      foldFit = await fitOnSplit(fold.train, fold.val, fold.holdout, 'v3');
      if (typeof foldFit.metrics.holdoutMae === 'number') {
        kFoldMaes.push(foldFit.metrics.holdoutMae);
      }
      if (typeof foldFit.metrics.holdoutMacroF1 === 'number') {
        kFoldMacroF1s.push(foldFit.metrics.holdoutMacroF1);
      }
    } catch (err) {
      console.error('Error fitting K-Fold fold:', err);
    } finally {
      if (foldFit) {
        try { foldFit.model.dispose(); } catch { /* ignore */ }
      }
    }
  }

  const kFoldEvaluation = kFoldMaes.length > 0 ? {
    mae: computeConfidenceInterval(kFoldMaes),
    macroF1: computeConfidenceInterval(kFoldMacroF1s),
  } : undefined;

  // فاز ۱٫۳ — کالیبراسیون بر روی holdout مدل نهایی
  let calibration: CalibrationSummary | undefined;
  let scoreMetrics: ScoreMetric[] | undefined;
  if (active.holdoutTrue && active.holdoutPred) {
    const obsSlice = (rows: number[][]) => rows.map(r => r.slice(SCORE_COUNT));
    calibration = computeCalibrationMetrics(
      obsSlice(active.holdoutTrue),
      obsSlice(active.holdoutPred),
      OBSERVATION_IDS.length
    );

    const scoresSlice = (rows: number[][]) => rows.map(r => r.slice(0, SCORE_COUNT));
    scoreMetrics = computeScoreMetrics(
      scoresSlice(active.holdoutTrue),
      scoresSlice(active.holdoutPred),
      [
        'oiliness', 'dryness', 'dandruff', 'redness', 'densityScore',
        'shine', 'patchiness', 'pigmentation', 'hairThickness',
      ]
    );
  }

  return {
    obsThresholds: active.metrics.obsThresholds,
    holdoutPerClass: active.metrics.holdoutPerClass,
    holdoutMacroF1: active.metrics.holdoutMacroF1,
    labelSupport,
    suppressedLabels: inactiveLabelIds(labelSupport),
    repeatedHoldout: {
      mae: summarizeRepeatedRuns(repeatedMae),
      macroF1: summarizeRepeatedRuns(repeatedMacro),
    },
    kFoldEvaluation,
    calibration,
    scoreMetrics,
    retrainGate,
    modelPersisted,
    loss: active.metrics.loss,
    valLoss: active.metrics.valLoss,
    epochs: active.metrics.epochs,
    sampleCount: pool.length,
    sampleCountBySource: bySource,
    maeScores: active.metrics.maeScores,
    valMaeScores: active.metrics.valMaeScores,
    obsF1: active.metrics.obsF1,
    valObsF1: active.metrics.valObsF1,
    holdoutMae: active.metrics.holdoutMae,
    holdoutObsF1: active.metrics.holdoutObsF1,
    featureMeans: active.norm.means,
    featureStds: active.norm.stds,
    architecture: MODEL_ARCHITECTURE,
    trainedIds: pool.map(s => s.id),
    featureVersion,
    seed: splitSeed,
    datasetHash: stableTrainingSeed(pool).toString(16),
    evaluation: selectedEvaluation,
    v4Experiment,
  };
}

export async function loadLocalModel(): Promise<tf.LayersModel | null> {
  if (
    cachedModel
    && cachedModelFeatureVersion
    && isActiveLocalModelVersion(cachedModelFeatureVersion)
  ) {
    return cachedModel;
  }
  try {
    const model = await tf.loadLayersModel(MODEL_STORAGE_URL);
    if (modelOutputSize(model) !== OUTPUT_SIZE) {
      try { model.dispose(); } catch { /* ignore */ }
      try { await tf.io.removeModel(MODEL_STORAGE_URL); } catch { /* ignore */ }
      return null;
    }
    const inputSize = modelInputSize(model);
    const version = featureVersionFromInputSize(inputSize);
    if (!version) {
      try { model.dispose(); } catch { /* ignore */ }
      try { await tf.io.removeModel(MODEL_STORAGE_URL); } catch { /* ignore */ }
      return null;
    }
    if (cachedModel && cachedModel !== model) {
      try { cachedModel.dispose(); } catch { /* ignore */ }
    }
    cachedModel = model;
    cachedModelFeatureVersion = version;
    return model;
  } catch {
    return null;
  }
}

export async function hasLocalModel(): Promise<boolean> {
  return (await loadLocalModel()) !== null;
}

export async function deleteLocalModel(): Promise<void> {
  try {
    await tf.io.removeModel(MODEL_STORAGE_URL);
  } catch {
    // مدلی وجود نداشت
  }
  try {
    await tf.io.removeModel(MODEL_BACKUP_URL);
  } catch {
    // پشتیبانی وجود نداشت
  }
  if (cachedModel) {
    try { cachedModel.dispose(); } catch { /* ignore */ }
  }
  cachedModel = null;
  cachedModelFeatureVersion = null;
  cachedNorm = null;
}

/** فاز ۰٫۵ — آیا نسخهٔ پشتیبان قابل بازگردانی وجود دارد؟ */
export async function hasModelBackup(): Promise<boolean> {
  try {
    const models = await tf.io.listModels();
    return Object.prototype.hasOwnProperty.call(models, MODEL_BACKUP_URL);
  } catch {
    return false;
  }
}

/**
 * فاز ۰٫۵ — بازگردانی مدل به آخرین نسخهٔ پشتیبان (قبل از آخرین آموزش موفق).
 * وزن‌های واقعی بازگردانده می‌شوند، نه فقط متادیتا.
 */
export async function rollbackLocalModel(): Promise<boolean> {
  if (!(await hasModelBackup())) return false;
  try {
    await tf.io.copyModel(MODEL_BACKUP_URL, MODEL_STORAGE_URL);
  } catch {
    return false;
  }
  if (cachedModel) {
    try { cachedModel.dispose(); } catch { /* ignore */ }
  }
  cachedModel = null;
  cachedModelFeatureVersion = null;
  cachedNorm = null;
  return true;
}

// =============== موج ۳ (O3) — مدل داخل بکاپ + challenger وارداتی ===============

/** نشانی ذخیرهٔ مدل وارداتی تا لحظهٔ تصمیم کاربر — «مستقیم فعال نشود» نقشه‌راه */
const MODEL_CHALLENGER_URL = 'indexeddb://scalpai-local-model-challenger';

/**
 * خروجی مدل فعال به‌صورت بستهٔ قابل‌حمل برای قرار گرفتن در ZIP بکاپ.
 * بدون مدل فعال → null (بکاپ بدون مدل هم معتبر است).
 */
export async function exportActiveModelBundle(
  metadata: LocalModelMetadata | null,
): Promise<LocalModelBackupBundle | null> {
  const model = await loadLocalModel();
  if (!model) return null;
  // handler هنری save می‌شود ولی هیچ‌جا ارسال نمی‌شود — فقط artifacts را
  // برای ما می‌گیرد (الگوی استاندارد استخراج مدل به حافظه در tfjs).
  // نکته: داخل یک object box نگه داشته می‌شود چون narrowing تایپ‌اسکریپت
  // مقداردهی داخل closure را نمی‌بیند و متغیر ساده را never حدس می‌زند.
  const box: { artifacts: tf.io.ModelArtifacts | null } = { artifacts: null };
  await model.save(tf.io.withSaveHandler(async (a: tf.io.ModelArtifacts) => {
    box.artifacts = a;
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));
  const captured = box.artifacts;
  if (!captured || !captured.modelTopology || !captured.weightSpecs || !captured.weightData) {
    return null;
  }
  // WeightData می‌تواند چند ArrayBuffer باشد؛ برای base64 تک‌بافر می‌خواهیم.
  // ترتیب الحاق همان ترتیب WeightData است و manifest هم به همین ترتیب آفست
  // می‌خورد، پس round-trip با tf.io.fromMemory سازگار می‌ماند.
  const weightData = captured.weightData instanceof ArrayBuffer
    ? captured.weightData
    : (() => {
        const parts = captured.weightData as ArrayBuffer[];
        const total = parts.reduce((sum, b) => sum + b.byteLength, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) { out.set(new Uint8Array(part), offset); offset += part.byteLength; }
        return out.buffer;
      })();
  return artifactsToBundle(
    {
      modelTopology: captured.modelTopology as Record<string, unknown>,
      weightSpecs: captured.weightSpecs as unknown as Array<Record<string, unknown>>,
      weightData,
    },
    // متادیتا به‌صورت JSON خام در بکاپ می‌نشیند؛ نوع ساختاری آن به LocalModelMetadata
    // برمی‌گردد (interface بدون index signature است → cast مرزی لازم است).
    { featureVersion: cachedModelFeatureVersion, metadata: metadata as unknown as Record<string, unknown> | null },
  );
}

/**
 * استقرار بستهٔ وارداتی در جایگاه challenger (نه فعال). بستهٔ نامعتبر خطا
 * می‌اندازد تا UI خطای «بکاپ مدل خراب» را نشان دهد نه فاجعهٔ بی‌صدا.
 */
export async function stageBundleAsChallenger(bundle: LocalModelBackupBundle): Promise<void> {
  if (!isValidModelBundle(bundle)) throw new Error('Invalid model bundle');
  const artifacts = bundleToArtifacts(bundle);
  const challenger = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: artifacts.modelTopology,
      weightSpecs: artifacts.weightSpecs,
      weightData: artifacts.weightData,
    }),
  );
  try {
    await challenger.save(MODEL_CHALLENGER_URL);
  } finally {
    try { challenger.dispose(); } catch { /* ignore */ }
  }
}

/** آیا مدل وارداتی در انتظار تصمیم کاربر است؟ */
export async function hasChallengerModel(): Promise<boolean> {
  try {
    const models = await tf.io.listModels();
    return Object.prototype.hasOwnProperty.call(models, MODEL_CHALLENGER_URL);
  } catch {
    return false;
  }
}

/**
 * فعال‌سازی challenger به تصمیم کاربر — با همان قاعدهٔ امن آموزش: ابتدا از
 * مدل فعال فعلی پشتیبان (rollback) گرفته می‌شود، بعد جایگزینی. در صورت شکست،
 * false برمی‌گردد و هیچ‌کدام از دو جایگاه خراب نمی‌شود.
 */
export async function activateChallengerModel(): Promise<boolean> {
  if (!(await hasChallengerModel())) return false;
  try {
    if (await hasLocalModel()) {
      try { await tf.io.copyModel(MODEL_STORAGE_URL, MODEL_BACKUP_URL); } catch { /* ignore */ }
    } else {
      try { await tf.io.removeModel(MODEL_BACKUP_URL); } catch { /* ignore */ }
    }
    await tf.io.copyModel(MODEL_CHALLENGER_URL, MODEL_STORAGE_URL);
    try { await tf.io.removeModel(MODEL_CHALLENGER_URL); } catch { /* ignore */ }
  } catch {
    return false;
  }
  // کش خنثی تا خواندن بعدی challenger فعال‌شده را بگیرد (و اعتبارسنجی
  // اندازهٔ خروجی loadLocalModel روی آن هم اعمال شود)
  if (cachedModel) {
    try { cachedModel.dispose(); } catch { /* ignore */ }
  }
  cachedModel = null;
  cachedModelFeatureVersion = null;
  cachedNorm = null;
  return true;
}

/** حذف challenger بدون فعال‌سازی */
export async function discardChallengerModel(): Promise<void> {
  try {
    await tf.io.removeModel(MODEL_CHALLENGER_URL);
  } catch {
    /* challengeri وجود نداشت */
  }
}

async function predictWithMCDropout(
  model: tf.LayersModel,
  vector: number[],
  numRuns = 10
): Promise<{ meanValues: number[]; uncertainty: number }> {
  return tf.tidy(() => {
    const inputT = tf.tensor2d([vector]);
    const predictions: tf.Tensor[] = [];
    for (let r = 0; r < numRuns; r++) {
      const pred = model.apply(inputT, { training: true }) as tf.Tensor;
      predictions.push(pred);
    }
    const stacked = tf.stack(predictions);
    const mean = tf.mean(stacked, 0);
    const variance = tf.mean(tf.square(tf.sub(stacked, mean)), 0);
    const std = tf.sqrt(variance);
    const meanUncertainty = tf.mean(std);

    return {
      meanValues: Array.from(mean.dataSync()),
      uncertainty: meanUncertainty.dataSync()[0],
    };
  });
}

export async function predictWithLocalModel(
  features: ScalpRawMetrics,
  questionnaireFeatures?: number[] | null,
): Promise<LocalModelPrediction | null> {
  const model = await loadLocalModel();
  if (!model) return null;

  const rawVector = featureVectorToArray(features);
  // فاز ۴٫۳ — سنجش OOD روی همان بردار تصویری خام، پیش از نرمال‌سازی
  // (آمار ذخیره‌شده هم بر همین مبنا محاسبه شده است).
  const ood = assessOutOfDistribution(
    rawVector,
    cachedNorm?.means?.slice(0, rawVector.length),
    cachedNorm?.stds?.slice(0, rawVector.length),
  );

  let vector = rawVector;
  if (cachedModelFeatureVersion === FEATURE_VERSION_WITH_QUESTIONNAIRE) {
    const q = hasUsableQuestionnaireFeatures(questionnaireFeatures)
      ? questionnaireFeatures!
      : zeroQuestionnaireFeatures();
    vector = [...vector, ...q];
  }

  if (cachedNorm?.means?.length === vector.length) {
    vector = applyNorm(vector, cachedNorm.means, cachedNorm.stds);
  } else if (cachedNorm?.means?.length && cachedNorm.means.length !== vector.length) {
    // نرمال‌سازی با ابعاد ناسازگار → پیش‌بینی بی‌معنی؛ رد کن
    return null;
  }

  // فاز ۳٫۲ — استفاده از فرآیند پیش‌بینی تصادفی با فرکانس MC-Dropout
  const { meanValues, uncertainty } = await predictWithMCDropout(model, vector, 10);

  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const scores = {} as ScalpHeuristicScores;
  SCORE_KEYS.forEach((key, i) => {
    scores[key] = clamp(meanValues[i]);
  });

  /**
   * فاز ۲٫۲ + ۲٫۳ — برچسب‌هایی که در دیتاست support کافی نداشتند سرکوب
   * می‌شوند (مدل روی آن‌ها عملاً چیزی نیاموخته و خروجی‌اش اطمینان کاذب است)،
   * و برای بقیه به‌جای آستانهٔ ثابت ۰٫۴۵ از آستانهٔ کالیبره‌شده استفاده می‌شود.
   */
  const observations = OBSERVATION_IDS.filter((id, i) => {
    if (cachedSuppressedLabels.has(id)) return false;
    const v = meanValues[SCORE_COUNT + i] ?? 0;
    const thr = cachedObsThresholds?.[i] ?? OBS_THRESHOLD;
    return v >= thr;
  });

  return { scores, observations, ood, uncertainty };
}

/** مقایسهٔ خروجی مدل با امتیازهای heuristic روی همان فیچرها */
export async function compareModelToScores(
  features: ScalpRawMetrics,
  heuristicScores: ScalpHeuristicScores,
  questionnaireFeatures?: number[] | null,
): Promise<{
  model: LocalModelPrediction | null;
  heuristic: ScalpHeuristicScores;
  mae: number | null;
} | null> {
  const model = await predictWithLocalModel(features, questionnaireFeatures);
  if (!model) return { model: null, heuristic: heuristicScores, mae: null };
  let sum = 0;
  for (const key of SCORE_KEYS) {
    sum += Math.abs(model.scores[key] - heuristicScores[key]);
  }
  return {
    model,
    heuristic: heuristicScores,
    mae: sum / SCORE_KEYS.length,
  };
}

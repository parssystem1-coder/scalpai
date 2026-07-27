/**
 * analysis-utils.ts
 * -----------------------------------------------------------------------
 * منطق مشترک ساخت Prompt تحلیل آنلاین (Vision LLM) — استخراج‌شده از
 * src/pages/ai-analysis/useAISession.ts (analyzeWithGemini) تا هم مسیر
 * معمول تحلیل آنلاین (با مشتری/نوبت واقعی) و هم مسیرهای بدون مشتری واقعی
 * (مثل تب «استخر تصاویر آموزشی» در صفحهٔ یادگیری ماشین) از دقیقاً همان
 * پرامپت بالینی استفاده کنند و رفتار دو مسیر واگرا نشود.
 *
 * هشدار: این تنها منبع حقیقت متن پرامپت است — تغییر اینجا رفتار
 * AIAnalysis (src/pages/ai-analysis) را هم تغییر می‌دهد.
 */

import type { Client } from '../db/types';
import { observationCatalogPromptBlock } from './diagnosisCatalog';
import {
  acquisitionContextPrompt,
  readAnalysisAcquisitionContext,
  type AnalysisAcquisitionContext,
} from './analysisAcquisitionContext';
import {
  buildQuestionnaireAiContext,
  questionnaireContextPrompt,
  type QuestionnaireAiContext,
} from './questionnaireAiContext';
import { MS_PER_YEAR, DEFAULT_AI_CONFIDENCE_THRESHOLD, LESION_CONFIDENCE_FLOOR } from './heuristicConstants';
import { aiUtils, offlineUtils } from '../db';
import type { AIAnalysisResult, OfflineAnalysisResult, TrainingSampleLabel } from '../db/types';

import { buildChartDataFromScores, parseAIAnalysisResult, parseOfflineAnalysisResult } from './analysisSchemas';
import { extractImageFeatures, composeOfflineResult, type ScalpRawMetrics } from './scalpFeatures';
import { calibrateScoresForAcquisition } from './analysisAcquisitionContext';
import type { AIProviderConfig } from './aiProvider';


export interface BuildScalpAnalysisPromptParams {
  /** زمینهٔ لنز/ناحیهٔ سر که عکس با آن گرفته شده — از readAnalysisAcquisitionContext */
  acquisitionContext: AnalysisAcquisitionContext;
  /**
   * پرسشنامهٔ پزشکی نوبت فعال. برای مسیرهای بدون مشتری واقعی (مثل استخر
   * آموزشی) می‌توان `buildQuestionnaireAiContext({ revision: null, includedInPrompt: false })` داد.
   */
  questionnaireContext: QuestionnaireAiContext;
  /** آیا رضایت صریح برای ارسال دادهٔ پزشکی/سن/جنسیت به AI داده شده؟ */
  includeMedical: boolean;
  /** برای محاسبهٔ سن در نبود پرسشنامه — در مسیرهای بدون مشتری واقعی می‌توان undefined/null داد */
  client?: Client | null;
}

/**
 * بخش «اطلاعات بیمار» ابتدای پرامپت — یا از پرسشنامه (در صورت رضایت)،
 * یا فقط سن/جنسیت (اگر رضایت هست ولی پرسشنامه‌ای موجود نیست)،
 * یا هشدار «رضایت داده نشده» (اگر includeMedical=false).
 */
export function buildScalpAnalysisPatientInfoBlock(
  params: BuildScalpAnalysisPromptParams,
): string {
  const { questionnaireContext, includeMedical, client } = params;
  const medicalPromptBlock = includeMedical
    ? questionnaireContextPrompt(questionnaireContext, client ?? undefined)
    : '';
  return medicalPromptBlock
    || (includeMedical
      ? `Patient Info:\n- Age: ${
          client?.birthDate
            ? Math.floor((Date.now() - new Date(client.birthDate).getTime()) / MS_PER_YEAR)
            : 'unknown'
        }\n- Gender: ${client?.gender === 'male' ? 'Male' : client?.gender === 'female' ? 'Female' : 'unknown'}`
      : 'Patient medical questionnaire was NOT provided (privacy setting). Base conclusions only on the image and acquisition context.');
}

/**
 * متن کامل پرامپت تحلیل بالینی پوست سر/تریکوسکوپی که به سرویس AI
 * چندوجهی فرستاده می‌شود — عیناً همان پرامپتی که قبلاً inline داخل
 * useAISession.ts (تابع analyzeWithGemini) بود.
 */
export function buildScalpAnalysisPrompt(params: BuildScalpAnalysisPromptParams): string {
  const patientInfoBlock = buildScalpAnalysisPatientInfoBlock(params);

  return `You are a professional trichologist AI assistant. Analyze this scalp/hair trichoscopy/clinical image with the SAME clinical depth used in offline ScalpAI reports.

${patientInfoBlock}

Image Acquisition Context:
${acquisitionContextPrompt(params.acquisitionContext)}

Interpret visible colors, fluorescence, vascular detail and tissue depth according to the stated illumination mode. Do not interpret mode-induced color changes as pathology by themselves.

Respond ONLY with a valid JSON object (no markdown, no code blocks) in this exact format:
{
  "lesions": [
    {"type": "dandruff", "confidence": 0.85, "bbox": [x1, y1, x2, y2], "category": "trichoscopy", "evidenceLevel": "observed"}
  ],
  "observations": ["dandruff", "hairLoss", "miniaturization"],
  "hairDensity": {"level": "کم یا متوسط یا زیاد", "score": 65},
  "scalpCondition": {
    "oiliness": 40,
    "dryness": 25,
    "dandruff": 15,
    "redness": 10,
    "shine": 30,
    "patchiness": 20,
    "pigmentation": 15,
    "hairThickness": 55
  },
  "hairLoss": {"level": "خفیف یا متوسط یا شدید", "pattern": "pattern description in Persian"},
  "recommendations": [
    "prioritized clinical recommendation 1 in Persian",
    "recommendation 2 in Persian",
    "recommendation 3 in Persian"
  ]
}

REQUIRED scalpCondition scores (each 0-100 integers, always include ALL fields):
- oiliness: scalp oiliness
- dryness: scalp dryness
- dandruff: flaking/dandruff severity
- redness: erythema/inflammation redness
- shine: surface sebum/shine
- patchiness: patchy hair-loss appearance
- pigmentation: pigment irregularity on scalp
- hairThickness: relative hair shaft thickness (higher = thicker)

REQUIRED clinical observations:
- "observations" MUST be an array of diagnosis IDs chosen ONLY from this catalog (exact id strings):
${observationCatalogPromptBlock()}
- Include EVERY applicable finding from the catalog (scalp condition, hair-loss patterns, inflammation/infection, trichoscopy signs, symptoms).
- Prefer specific IDs when evidence supports them (e.g. miniaturization, yellowDots, seborrheicDermatitis, femalePattern).
- Use [] only if truly none apply.

Lesions (CRITICAL — maximize useful detections with accurate boxes):
- "type" MUST be a catalog ID from the same list above (exact id string) — NOT free Persian/English text.
- "category" MUST be either "condition" for a possible clinical condition or "trichoscopy" for a directly observed visual sign.
- "evidenceLevel" MUST be "observed" for a visible sign, "possible" for a condition suggested by the image, or "requires_confirmation" when clinical/laboratory confirmation is needed (especially fungal/infectious/scarring conditions).
- Never present a possible condition as a confirmed diagnosis.
- Be thorough: report EVERY distinct visible problem area as a SEPARATE lesion entry (typically 3–12 boxes when abnormalities exist; mild findings OK if confidence >= 0.35).
- Look carefully for: flaking/dandruff, erythema/redness, oily shine patches, sparse/patchy hair loss zones, empty follicles, perifollicular scaling, yellow/white dots, miniaturized hairs, folliculitis pustules, psoriasis plaques, fungal-looking areas, excoriation.
- bbox: PIXEL coordinates [x1, y1, x2, y2] relative to the FULL image width/height (top-left → bottom-right).
- Draw a TIGHT square around EACH focus — not the whole image, not huge loose boxes. Prefer multiple small accurate boxes over one large vague box.
- If the same finding type appears in several places, return multiple lesion objects with the same type and different bboxes.
- Never invent lesions with no visual evidence; never return an empty lesions array when clear abnormalities are visible.

Recommendations:
- 3–6 actionable Persian recommendations prioritized by severity (urgent care first).
- Align recommendations with the scored metrics and selected observation IDs.
- If medical questionnaire context is present, prioritize recommendations that account for medications, medical history and recent changes — without inventing image findings.`;
}

// =============================================================================
// اجرای تحلیل «مستقل» (بدون مشتری/نوبت واقعی) — برای «استخر تصاویر آموزشی»
// -----------------------------------------------------------------------------
// عمداً هیچ‌کدام از این توابع رکورد Analysis/Session نمی‌سازند و به
// resolveActiveSession/aggregateVisitResults/addAnalysis وابسته نیستند —
// برخلاف useAISession.ts/useOfflineSession.ts که کاملاً به «ویزیت یک مشتری
// واقعی» گره خورده‌اند. نتیجه فقط به فراخوان برگردانده می‌شود تا در
// ExpertLabelingPanel نمایش داده شود و در صورت ذخیره، مستقیماً یک
// TrainingSample بسازد.
// =============================================================================

export interface StandaloneOfflineAnalysisParams {
  /** data URL یا مسیر قابل بارگذاری تصویر (خروجی resolveGalleryItemUrl) */
  imageUrl: string;
  /** متادیتای آیتم گالری — برای زمینهٔ ناحیه/لنز (اختیاری) */
  metadata?: Record<string, unknown>;
  isRtl: boolean;
  confidenceThreshold?: number;
}

/**
 * تحلیل آفلاین مستقل — از همان موتور offlineUtils.analyze (Python/مرورگر)
 * که useOfflineSession.ts استفاده می‌کند، اما بدون مدل محلی (چون مدل محلی
 * نیازمند questionnaireFeatures/session است) و بدون نوشتن در جدول analyses.
 */
export async function runStandaloneOfflineAnalysis(
  params: StandaloneOfflineAnalysisParams,
): Promise<OfflineAnalysisResult> {
  const { imageUrl, metadata, isRtl, confidenceThreshold = DEFAULT_AI_CONFIDENCE_THRESHOLD } = params;
  const acquisitionContext = readAnalysisAcquisitionContext(metadata);

  const response = await offlineUtils.analyze(imageUrl, isRtl ? 'fa' : 'en');
  if (!response.success) {
    throw new Error(response.error || 'Offline analysis failed');
  }
  const rawResult = parseOfflineAnalysisResult(response.data, confidenceThreshold);
  const extracted = await extractImageFeatures(imageUrl);
  const calibratedScores = calibrateScoresForAcquisition(
    {
      oiliness: rawResult.scalpCondition.oiliness,
      dryness: rawResult.scalpCondition.dryness,
      dandruff: rawResult.scalpCondition.dandruff ?? 0,
      redness: rawResult.scalpCondition.redness ?? 0,
      densityScore: rawResult.hairDensity.score,
      shine: rawResult.scalpCondition.shine ?? 0,
      patchiness: rawResult.scalpCondition.patchiness ?? 0,
      pigmentation: rawResult.scalpCondition.pigmentation ?? 0,
      hairThickness: rawResult.scalpCondition.hairThickness ?? 50,
    },
    acquisitionContext,
  );
  const rebuilt = composeOfflineResult(
    extracted,
    calibratedScores,
    isRtl,
    rawResult.engine === 'model' ? 'model' : 'browser',
    rawResult.hairLoss.pattern,
    rawResult.observations as import('./diagnosisCatalog').ObservationId[] | undefined,
  );
  return {
    ...rawResult,
    ...rebuilt,
    engine: rawResult.engine ?? rebuilt.engine,
    acquisitionContext,
  };
}

export interface StandaloneOnlineAnalysisParams {
  /** data URL یا محتوای کامل تصویر (خروجی resolveGalleryItemUrl) */
  imageUrl: string;
  metadata?: Record<string, unknown>;
  isRtl: boolean;
  runtime: AIProviderConfig;
  confidenceThreshold?: number;
  signal?: AbortSignal;
}

/**
 * تحلیل آنلاین مستقل — از همان aiUtils.analyze و buildScalpAnalysisPrompt
 * که useAISession.ts استفاده می‌کند، بدون مشتری/پرسشنامه/نوبت واقعی
 * (رضایت ارسال دادهٔ پزشکی همیشه false است چون مشتری واقعی وجود ندارد)
 * و بدون نوشتن در جدول analyses.
 */
export async function runStandaloneOnlineAnalysis(
  params: StandaloneOnlineAnalysisParams,
): Promise<AIAnalysisResult> {
  const { imageUrl, metadata, runtime, confidenceThreshold = DEFAULT_AI_CONFIDENCE_THRESHOLD, signal } = params;
  const acquisitionContext = readAnalysisAcquisitionContext(metadata);
  const questionnaireContext: QuestionnaireAiContext = buildQuestionnaireAiContext({
    revision: null,
    includedInPrompt: false,
  });

  const prompt = buildScalpAnalysisPrompt({
    acquisitionContext,
    questionnaireContext,
    includeMedical: false,
    client: null,
  });

  const base64Image = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl;
  const mimeMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const apiResult = await aiUtils.analyze(runtime, base64Image, mimeType, prompt, { signal });
  if (!apiResult.success || !apiResult.text) {
    throw new Error(apiResult.error || 'Online analysis failed');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(apiResult.text);
  } catch {
    throw new Error('AI response was not valid JSON. Please try again.');
  }
  const parsed = parseAIAnalysisResult(
    parsedJson,
    Math.min(confidenceThreshold, LESION_CONFIDENCE_FLOOR + 0.1),
  );
  return {
    ...parsed,
    acquisitionContext,
    questionnaireContext,
    chartData: parsed.chartData?.length
      ? parsed.chartData
      : buildChartDataFromScores(
        {
          densityScore: parsed.hairDensity.score,
          oiliness: parsed.scalpCondition.oiliness,
          dryness: parsed.scalpCondition.dryness,
          dandruff: parsed.scalpCondition.dandruff,
          redness: parsed.scalpCondition.redness,
          shine: parsed.scalpCondition.shine,
          patchiness: parsed.scalpCondition.patchiness,
          pigmentation: parsed.scalpCondition.pigmentation,
          hairThickness: parsed.scalpCondition.hairThickness,
        },
        params.isRtl,
      ),
  };
}

/**
 * تبدیل خروجی تحلیل آنلاین/آفلاین به شکل TrainingSampleLabel — برای
 * پیش‌بارگذاری فرم ExpertLabelingPanel قبل از ذخیره‌سازی به‌عنوان نمونهٔ
 * آموزشی (همان نگاشتی که useAISession.ts داخل addTrainingSample انجام می‌دهد).
 */
export function analysisResultToTrainingLabel(
  result: AIAnalysisResult | OfflineAnalysisResult,
): TrainingSampleLabel {
  return {
    oiliness: result.scalpCondition.oiliness,
    dryness: result.scalpCondition.dryness,
    dandruff: result.scalpCondition.dandruff ?? 0,
    redness: result.scalpCondition.redness ?? 0,
    densityScore: result.hairDensity.score,
    shine: result.scalpCondition.shine,
    patchiness: result.scalpCondition.patchiness,
    pigmentation: result.scalpCondition.pigmentation,
    hairThickness: result.scalpCondition.hairThickness,
    hairLossLevel: result.hairLoss.level,
    hairDensityLevel: result.hairDensity.level,
    lesions: result.lesions.map(l => ({ type: l.type, confidence: l.confidence, bbox: l.bbox })),
    observations: result.observations ?? [],
  };
}

/** فیچرهای خام تصویر (برای ذخیره‌سازی TrainingSample) — همان extractImageFeatures */
export async function extractStandaloneImageFeatures(imageUrl: string): Promise<ScalpRawMetrics> {
  const { metrics } = await extractImageFeatures(imageUrl);
  return metrics;
}

/**
 * تنظیمات فعلی AI را به پیکربندی قابل‌اجرا تبدیل می‌کند — همان منطقی که
 * useAISession.ts (analyzeWithGemini) قبل از aiUtils.analyze اجرا می‌کند،
 * بدون بخش «همگام‌سازی خودکار تنظیمات» که به caller مربوط است.
 */
export async function resolveCurrentAiRuntimeConfig(settings: {
  aiProvider?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModelName?: string;
  aiProxyUrl?: string;
}): Promise<AIProviderConfig> {
  const { resolveAiRuntimeConfig } = await import('./aiProvider');
  return resolveAiRuntimeConfig({
    provider: (settings.aiProvider as AIProviderConfig['provider']) || 'gemini',
    apiKey: settings.aiApiKey || '',
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModelName,
    proxyUrl: settings.aiProxyUrl,
  });
}

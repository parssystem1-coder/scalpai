/**
 * ثابت‌های heuristic تحلیل پوست سر / تشخیص‌های کاتالوگ.
 *
 * منبع واحد حقیقت: shared/scalp-constants.json — همان فایلی که
 * python/analyze.py هم می‌خواند. قبلاً این اعداد در دو جا (اینجا و analyze.py)
 * دستی تکرار شده بودند؛ اگر یکی عوض می‌شد، همان تصویر با موتور Python و موتور
 * مرورگر نتیجهٔ متفاوت می‌داد — بی‌صدا، چون fallback بین دو موتور خودکار است.
 *
 * scripts/check-shared-constants.cjs همگام بودن سه فایل را بررسی می‌کند.
 */
import sharedConstants from '@shared/scalp-constants.json';

/** اندازهٔ شبکهٔ تحلیل ناحیه‌ای — باید با analyze.py یکی باشد */
export const GRID_SIZE: number = sharedConstants.GRID_SIZE;

/** ضرایب تبدیل فیچر خام → امتیاز ۰–۱۰۰ (از فایل مشترک) */
export const HEURISTIC_FEATURE_SCALE = sharedConstants.FEATURE_SCALE satisfies {
  dandruffFromWhiteFlake: number;
  rednessFromRatio: number;
  oilinessTextureDivisor: number;
  drynessBrightnessBase: number;
  drynessBrightnessDivisor: number;
  densityFromCoverage: number;
  shineFromRatio: number;
  patchinessFromRaw: number;
  pigmentationFromRaw: number;
  hairThicknessEdgeFactor: number;
  minHairArea: number;
};

/** آستانه‌های پیشنهاد متنی بر اساس متریک خام */
export const HEURISTIC_METRIC_RECOMMEND = {
  whiteFlakeDandruff: 0.08,
  rednessRatio: 0.06,
  textureOiliness: 45,
  brightnessDark: 120,
  brightnessSparse: 150,
  hairCoverageSparse: 0.25,
  shineHigh: 0.012,
  patchinessIrregular: 0.18,
  pigmentationUneven: 35,
} as const;

/** آستانه‌های پیشنهاد بر اساس امتیاز ۰–۱۰۰ */
export const HEURISTIC_SCORE_RECOMMEND = {
  dandruff: 35,
  redness: 30,
  oiliness: 45,
  dryness: 45,
  densityLow: 40,
  shine: 40,
  patchiness: 35,
  pigmentation: 40,
} as const;

/** آستانه‌های نگاشت امتیاز → شناسهٔ تشخیص در diagnosisCatalog */
export const OBSERVATION_SCORE_THRESHOLDS = {
  dandruff: 12,
  seborrheaShine: 18,
  seborrheaOil: 40,
  seborrheaShineSoft: 10,
  seborrheicDandruff: 20,
  seborrheicOil: 35,
  seborrheicRedness: 15,
  oily: 35,
  dry: 35,
  sensitivityRedness: 18,
  sensitivityDry: 25,
  hairLossDensity: 55,
  thinningThickness: 55,
  breakageThickness: 45,
  breakageDensity: 35,
  shaftDamageThickness: 40,
  shaftDamageShine: 20,
  inflammationRedness: 12,
  erythemaRedness: 22,
  lesionsPigmentation: 25,
  lesionsDandruff: 20,
  lesionsRedness: 15,
  alopeciaPatchiness: 22,
  alopeciaDensity: 60,
  androgenicDensity: 50,
  androgenicOil: 30,
  androgenicPatchinessMax: 40,
  femalePatternDensity: 48,
  femalePatternPatchMin: 15,
  femalePatternPatchMax: 45,
  femalePatternOilMax: 55,
  psoriasisDandruff: 25,
  psoriasisRedness: 20,
  psoriasisPigmentation: 20,
  folliculitisRedness: 30,
  folliculitisShineMax: 35,
  fungalDandruff: 22,
  fungalRedness: 18,
  fungalPigmentation: 25,
  scarringPatchiness: 35,
  scarringDensity: 40,
  telogenDensity: 55,
  telogenPatchMax: 30,
  telogenOilMax: 50,
  miniaturizationThickness: 42,
  miniaturizationDensity: 55,
  yellowDotsDensity: 45,
  yellowDotsOil: 40,
  yellowDotsPatchiness: 18,
  whiteDotsPatchiness: 30,
  whiteDotsDensity: 42,
  whiteDotsPigmentation: 20,
  perifollicularDandruff: 18,
  perifollicularRedness: 14,
  emptyFolliclesDensity: 40,
  emptyFolliclesPatchiness: 25,
  pruritusRedness: 20,
  pruritusDandruff: 15,
  defaultHairThickness: 50,
} as const;

export const DEFAULT_AI_CONFIDENCE_THRESHOLD = 0.45;
/** آستانهٔ پایین‌تر برای نگه‌داشتن ضایعات بیشتر روی تصویر (حتی اگر آستانهٔ کلی بالاتر باشد) */
export const LESION_CONFIDENCE_FLOOR = 0.35;
export const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
export const AI_RATE_LIMIT_DEFAULT_WAIT_S = 60;

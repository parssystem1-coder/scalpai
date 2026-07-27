/**
 * کاتالوگ مشترک تشخیص‌های کلینیکی پوست سر.
 * منبع واحد برای تریکولوژیست، تحلیل AI، تحلیل آفلاین و یادگیری ماشین.
 *
 * موارد جدید عمدتاً برای برچسب‌گذاری متخصص طراحی شده‌اند؛
 * heuristic فقط برای زیرمجموعه‌ای که از تصویر قابل تخمین است نگاشت می‌سازد.
 */

import { OBSERVATION_SCORE_THRESHOLDS } from './heuristicConstants';

export type ObservationGroupId =
  | 'scalpCondition'
  | 'hairLoss'
  | 'inflammationInfection'
  | 'trichoscopy'
  | 'symptomsOther';

export interface ObservationOption {
  id: string;
  fa: string;
  en: string;
  group: ObservationGroupId;
}

export const observationGroups: { id: ObservationGroupId; fa: string; en: string }[] = [
  { id: 'scalpCondition', fa: 'وضعیت پوست سر', en: 'Scalp condition' },
  { id: 'hairLoss', fa: 'ریزش و الگوی مو', en: 'Hair loss & pattern' },
  { id: 'inflammationInfection', fa: 'التهاب و عفونت', en: 'Inflammation & infection' },
  { id: 'trichoscopy', fa: 'یافته‌های تریکوسکوپی', en: 'Trichoscopy findings' },
  { id: 'symptomsOther', fa: 'علائم و سایر', en: 'Symptoms & other' },
];

export const observationOptions = [
  // —— وضعیت پوست سر ——
  { id: 'dandruff', fa: 'شوره', en: 'Dandruff', group: 'scalpCondition' },
  { id: 'seborrhea', fa: 'سبوره', en: 'Seborrhea', group: 'scalpCondition' },
  { id: 'seborrheicDermatitis', fa: 'درماتیت سبورئیک', en: 'Seborrheic Dermatitis', group: 'scalpCondition' },
  { id: 'oily', fa: 'چربی پوست سر', en: 'Oily Scalp', group: 'scalpCondition' },
  { id: 'dry', fa: 'خشکی پوست سر', en: 'Dry Scalp', group: 'scalpCondition' },
  { id: 'sensitivity', fa: 'حساسیت پوست سر', en: 'Scalp Sensitivity', group: 'scalpCondition' },
  { id: 'contactDermatitis', fa: 'درماتیت تماسی', en: 'Contact Dermatitis', group: 'scalpCondition' },

  // —— ریزش و الگو ——
  { id: 'hairLoss', fa: 'ریزش مو', en: 'Hair Loss', group: 'hairLoss' },
  { id: 'thinning', fa: 'نازک شدن مو', en: 'Hair Thinning', group: 'hairLoss' },
  { id: 'breakage', fa: 'شکنندگی مو', en: 'Hair Breakage', group: 'hairLoss' },
  { id: 'hairShaftDamage', fa: 'آسیب ساقه مو', en: 'Hair Shaft Damage', group: 'hairLoss' },
  { id: 'alopecia', fa: 'آلوپسی آره‌آتا', en: 'Alopecia Areata', group: 'hairLoss' },
  { id: 'androgenic', fa: 'آلوپسی آندروژنتیک', en: 'Androgenic Alopecia', group: 'hairLoss' },
  { id: 'femalePattern', fa: 'الگوی زنانه ریزش', en: 'Female Pattern Hair Loss', group: 'hairLoss' },
  { id: 'telogen', fa: 'ریزش تلوژن', en: 'Telogen Effluvium', group: 'hairLoss' },
  { id: 'anagenEffluvium', fa: 'ریزش آناژن', en: 'Anagen Effluvium', group: 'hairLoss' },
  { id: 'tractionAlopecia', fa: 'آلوپسی کششی', en: 'Traction Alopecia', group: 'hairLoss' },
  { id: 'trichotillomania', fa: 'تریکوتیلومانیا', en: 'Trichotillomania', group: 'hairLoss' },
  { id: 'scarring', fa: 'آلوپسی اسکاری', en: 'Scarring Alopecia', group: 'hairLoss' },
  { id: 'lichenPlanopilaris', fa: 'لیکن پلان پیلاریس', en: 'Lichen Planopilaris', group: 'hairLoss' },
  { id: 'frontalFibrosing', fa: 'فیبروز پیشانی (FFA)', en: 'Frontal Fibrosing Alopecia', group: 'hairLoss' },
  { id: 'tractionAlopecia', fa: 'آلوپسی کششی', en: 'Traction Alopecia', group: 'hairLoss' },
  { id: 'centralCentrifugalCicatricialAlopecia', fa: 'آلوپسی اسکاری سانتریفیوژ مرکزی', en: 'Central Centrifugal Cicatricial Alopecia', group: 'hairLoss' },
  { id: 'discoidLupusErythematosus', fa: 'لوپوس دیسکوئید پوست سر', en: 'Discoid Lupus Erythematosus', group: 'hairLoss' },

  // —— التهاب و عفونت ——
  { id: 'inflammation', fa: 'التهاب', en: 'Inflammation', group: 'inflammationInfection' },
  { id: 'erythemaDiffuse', fa: 'اریتم منتشر', en: 'Diffuse Erythema', group: 'inflammationInfection' },
  { id: 'lesions', fa: 'ضایعات پوستی', en: 'Skin Lesions', group: 'inflammationInfection' },
  { id: 'excoriation', fa: 'خراشیدگی', en: 'Excoriation', group: 'inflammationInfection' },
  { id: 'psoriasis', fa: 'پسوریازیس', en: 'Psoriasis', group: 'inflammationInfection' },
  { id: 'folliculitis', fa: 'فولیکولیت', en: 'Folliculitis', group: 'inflammationInfection' },
  { id: 'fungal', fa: 'عفونت قارچی', en: 'Fungal Infection', group: 'inflammationInfection' },
  // گزینه‌های تکمیلی — گزینه‌های قدیمی عمداً حفظ شده‌اند
  { id: 'tineaCapitis', fa: 'یافته‌های سازگار با تینه‌آ کاپیتیس', en: 'Findings compatible with Tinea Capitis', group: 'inflammationInfection' },
  { id: 'scalpInfection', fa: 'عفونت پوست سر', en: 'Scalp Infection', group: 'inflammationInfection' },
  { id: 'bacterialFolliculitis', fa: 'فولیکولیت با احتمال عفونی', en: 'Possible Bacterial Folliculitis', group: 'inflammationInfection' },
  { id: 'scalpEczema', fa: 'اگزما/درماتیت پوست سر', en: 'Scalp Eczema/Dermatitis', group: 'inflammationInfection' },
  { id: 'severeScaling', fa: 'پوسته‌ریزی شدید', en: 'Severe Scaling', group: 'inflammationInfection' },
  { id: 'bacterialInfection', fa: 'عفونت باکتریایی', en: 'Bacterial Infection', group: 'inflammationInfection' },

  // —— تریکوسکوپی ——
  { id: 'miniaturization', fa: 'مینیاتوریزاسیون فولیکول', en: 'Follicular Miniaturization', group: 'trichoscopy' },
  { id: 'yellowDots', fa: 'نقاط زرد', en: 'Yellow Dots', group: 'trichoscopy' },
  { id: 'whiteDots', fa: 'نقاط سفید', en: 'White Dots', group: 'trichoscopy' },
  { id: 'perifollicularScaling', fa: 'پوسته‌ریزی اطراف فولیکول', en: 'Perifollicular Scaling', group: 'trichoscopy' },
  { id: 'emptyFollicles', fa: 'فولیکول خالی', en: 'Empty Follicles', group: 'trichoscopy' },
  { id: 'brokenHairs', fa: 'موهای شکسته', en: 'Broken Hairs', group: 'trichoscopy' },
  { id: 'blackDots', fa: 'نقاط سیاه', en: 'Black Dots', group: 'trichoscopy' },
  { id: 'commaHairs', fa: 'موهای کاما شکل', en: 'Comma Hairs', group: 'trichoscopy' },
  { id: 'corkscrewHairs', fa: 'موهای پیچ‌چوب‌پنبه‌ای', en: 'Corkscrew Hairs', group: 'trichoscopy' },
  { id: 'zigzagHairs', fa: 'موهای زیگزاگ', en: 'Zigzag Hairs', group: 'trichoscopy' },
  { id: 'exclamationMarkHairs', fa: 'موهای علامت تعجبی', en: 'Exclamation Mark Hairs', group: 'trichoscopy' },
  { id: 'taperedHairs', fa: 'موهای مخروطی/باریک‌شونده', en: 'Tapered Hairs', group: 'trichoscopy' },
  { id: 'vellusHairs', fa: 'موهای ولوس', en: 'Vellus Hairs', group: 'trichoscopy' },
  { id: 'morseCodeHairs', fa: 'موهای الگوی مورس', en: 'Morse-code Hairs', group: 'trichoscopy' },
  { id: 'hairDiameterVariability', fa: 'ناهمگونی قطر تار مو', en: 'Hair Diameter Variability', group: 'trichoscopy' },
  { id: 'follicularPlugging', fa: 'انسداد فولیکولی', en: 'Follicular Plugging', group: 'trichoscopy' },
  { id: 'singleHairFollicularUnits', fa: 'واحدهای تک‌تار مویی', en: 'Single-hair Follicular Units', group: 'trichoscopy' },
  { id: 'tuftedHairs', fa: 'موهای دسته‌ای', en: 'Tufted Hairs', group: 'trichoscopy' },
  { id: 'perifollicularCasts', fa: 'کست‌های اطراف فولیکول', en: 'Perifollicular Casts', group: 'trichoscopy' },
  { id: 'interfollicularScaling', fa: 'پوسته‌ریزی بین فولیکولی', en: 'Interfollicular Scaling', group: 'trichoscopy' },
  { id: 'redDots', fa: 'نقاط قرمز', en: 'Red Dots', group: 'trichoscopy' },
  { id: 'twistedRedLoops', fa: 'حلقه‌های قرمز پیچ‌خورده', en: 'Twisted Red Loops', group: 'trichoscopy' },
  { id: 'arborizingVessels', fa: 'رگ‌های شاخه‌ای', en: 'Arborizing Vessels', group: 'trichoscopy' },
  { id: 'glomerularVessels', fa: 'رگ‌های گلومرولی', en: 'Glomerular Vessels', group: 'trichoscopy' },
  { id: 'pustules', fa: 'پوسچول‌ها', en: 'Pustules', group: 'trichoscopy' },
  { id: 'yellowRedDischarge', fa: 'ترشح زرد/قرمز', en: 'Yellow-red Discharge', group: 'trichoscopy' },
  { id: 'whiteScarringAreas', fa: 'نواحی سفید اسکاری', en: 'White Scarring Areas', group: 'trichoscopy' },

  // —— علائم و سایر ——
  { id: 'pruritus', fa: 'خارش پوست سر', en: 'Scalp Pruritus', group: 'symptomsOther' },
  { id: 'prematureGraying', fa: 'سفیدی زودرس مو', en: 'Premature Graying', group: 'symptomsOther' },
] as const satisfies readonly ObservationOption[];

export type ObservationId = (typeof observationOptions)[number]['id'];

export const OBSERVATION_IDS: ObservationId[] = observationOptions.map(o => o.id);

const OBSERVATION_ID_SET = new Set<string>(OBSERVATION_IDS);

export function isObservationId(id: string): id is ObservationId {
  return OBSERVATION_ID_SET.has(id);
}

export function observationLabel(id: string, lang: 'fa' | 'en'): string | undefined {
  return observationOptions.find(o => o.id === id)?.[lang];
}

export function observationGroupLabel(groupId: ObservationGroupId, lang: 'fa' | 'en'): string {
  return observationGroups.find(g => g.id === groupId)?.[lang] ?? groupId;
}

/** گزینه‌های یک گروه برای UI */
export function observationsInGroup(groupId: ObservationGroupId) {
  return observationOptions.filter(o => o.group === groupId);
}

/** فقط شناسه‌های معتبر کاتالوگ را نگه می‌دارد (بدون تکرار).
 * برچسب فارسی/انگلیسی هم به شناسه نگاشت می‌شود تا نمونه‌های قدیمی
 * (که lesion.type را فارسی ذخیره کرده‌اند) در آموزش از دست نروند.
 */
export function normalizeObservationIds(ids: unknown): ObservationId[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<ObservationId>();
  const out: ObservationId[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const resolved = resolveObservationToken(raw);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/** نگاشت id / برچسب fa / برچسب en به ObservationId */
export function resolveObservationToken(token: string): ObservationId | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (isObservationId(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  const aliases: Record<string, ObservationId> = {
    tineacapitis: 'tineaCapitis',
    'tinea capitis': 'tineaCapitis',
    fungal: 'fungal',
    'broken hair': 'brokenHairs',
    'black dot': 'blackDots',
    'comma hair': 'commaHairs',
  };
  const alias = aliases[lower];
  if (alias) return alias;
  for (const opt of observationOptions) {
    if (opt.fa === trimmed || opt.en.toLowerCase() === lower) return opt.id;
  }
  // تطبیق نرم برای برچسب‌های قدیمی مثل «شوره احتمالی» / «Possible dandruff»
  for (const opt of observationOptions) {
    if (opt.fa.length >= 3 && (trimmed.includes(opt.fa) || (trimmed.length >= 3 && opt.fa.includes(trimmed)))) {
      return opt.id;
    }
    const en = opt.en.toLowerCase();
    if (en.length >= 5 && (lower.includes(en) || (lower.length >= 5 && en.includes(lower)))) {
      return opt.id;
    }
  }
  return null;
}

/** برچسب نمایشی ضایعه بر اساس زبان UI — شناسهٔ کاتالوگ به فارسی/انگلیسی */
export function lesionDisplayLabel(type: string, lang: 'fa' | 'en'): string {
  const id = resolveObservationToken(type);
  if (id) return observationLabel(id, lang) ?? type;
  return type;
}

/** ادغام چند منبع تشخیص بدون تکرار */
export function mergeObservationIds(...lists: Array<string[] | ObservationId[] | undefined | null>): ObservationId[] {
  const seen = new Set<ObservationId>();
  const out: ObservationId[] = [];
  for (const list of lists) {
    for (const id of normalizeObservationIds(list ?? [])) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** متن پرامپت AI — لیست شناسه‌ها و برچسب‌های دو زبانه */
export function observationCatalogPromptBlock(): string {
  return observationGroups
    .map(g => {
      const items = observationsInGroup(g.id)
        .map(o => `  - "${o.id}" (${o.fa} / ${o.en})`)
        .join('\n');
      return `${g.en} / ${g.fa}:\n${items}`;
    })
    .join('\n');
}

export interface ScoreLikeForObservations {
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
  densityScore: number;
  shine?: number;
  patchiness?: number;
  pigmentation?: number;
  hairThickness?: number;
}

/**
 * نگاشت heuristic امتیازهای عددی → شناسه‌های تشخیص کلینیکی.
 * تشخیص‌های تخصصی نادر (مثل FFA، تریکوتیلومانیا) فقط با برچسب متخصص وارد می‌شوند.
 */
export function observationsFromScores(scores: ScoreLikeForObservations): ObservationId[] {
  const ids: ObservationId[] = [];
  const th = OBSERVATION_SCORE_THRESHOLDS;
  const shine = scores.shine ?? 0;
  const patchiness = scores.patchiness ?? 0;
  const pigmentation = scores.pigmentation ?? 0;
  const hairThickness = scores.hairThickness ?? th.defaultHairThickness;
  const oil = scores.oiliness;
  const dry = scores.dryness;
  const dandruff = scores.dandruff;
  const redness = scores.redness;
  const density = scores.densityScore;

  if (dandruff >= th.dandruff) ids.push('dandruff');
  if (shine >= th.seborrheaShine || (oil >= th.seborrheaOil && shine >= th.seborrheaShineSoft)) ids.push('seborrhea');
  if (dandruff >= th.seborrheicDandruff && oil >= th.seborrheicOil && redness >= th.seborrheicRedness) ids.push('seborrheicDermatitis');
  if (oil >= th.oily) ids.push('oily');
  if (dry >= th.dry) ids.push('dry');
  if (redness >= th.sensitivityRedness && dry >= th.sensitivityDry) ids.push('sensitivity');
  if (density <= th.hairLossDensity) ids.push('hairLoss');
  if (hairThickness <= th.thinningThickness) ids.push('thinning');
  if (hairThickness <= th.breakageThickness && density >= th.breakageDensity) ids.push('breakage');
  if (hairThickness <= th.shaftDamageThickness && shine >= th.shaftDamageShine) ids.push('hairShaftDamage');
  if (redness >= th.inflammationRedness) ids.push('inflammation');
  if (redness >= th.erythemaRedness) ids.push('erythemaDiffuse');
  if (pigmentation >= th.lesionsPigmentation || (dandruff >= th.lesionsDandruff && redness >= th.lesionsRedness)) ids.push('lesions');
  if (patchiness >= th.alopeciaPatchiness && density <= th.alopeciaDensity) ids.push('alopecia');
  if (density <= th.androgenicDensity && oil >= th.androgenicOil && patchiness < th.androgenicPatchinessMax) ids.push('androgenic');
  if (density <= th.femalePatternDensity && patchiness >= th.femalePatternPatchMin && patchiness < th.femalePatternPatchMax && oil < th.femalePatternOilMax) ids.push('femalePattern');
  if (dandruff >= th.psoriasisDandruff && redness >= th.psoriasisRedness && pigmentation >= th.psoriasisPigmentation) ids.push('psoriasis');
  if (redness >= th.folliculitisRedness && shine < th.folliculitisShineMax) ids.push('folliculitis');
  if (dandruff >= th.fungalDandruff && redness >= th.fungalRedness && pigmentation >= th.fungalPigmentation) ids.push('fungal');
  if (patchiness >= th.scarringPatchiness && density <= th.scarringDensity) ids.push('scarring');
  if (density <= th.telogenDensity && patchiness < th.telogenPatchMax && oil < th.telogenOilMax) ids.push('telogen');
  if (hairThickness <= th.miniaturizationThickness && density <= th.miniaturizationDensity) ids.push('miniaturization');
  if (density <= th.yellowDotsDensity && oil >= th.yellowDotsOil && patchiness >= th.yellowDotsPatchiness) ids.push('yellowDots');
  if (patchiness >= th.whiteDotsPatchiness && density <= th.whiteDotsDensity && pigmentation >= th.whiteDotsPigmentation) ids.push('whiteDots');
  if (dandruff >= th.perifollicularDandruff && redness >= th.perifollicularRedness) ids.push('perifollicularScaling');
  if (density <= th.emptyFolliclesDensity && patchiness >= th.emptyFolliclesPatchiness) ids.push('emptyFollicles');
  if (redness >= th.pruritusRedness && dandruff >= th.pruritusDandruff) ids.push('pruritus');

  return ids;
}

/**
 * اگر منبع اصلی (AI/مدل) تشخیصی نداد، از روی امتیازها پر می‌کند.
 * برای صداقت محصول، پرشدن از heuristic را جدا علامت بزنید.
 */
export function resolveObservations(
  primary: string[] | undefined | null,
  scores?: ScoreLikeForObservations | null,
): { ids: ObservationId[]; filledFromHeuristic: boolean } {
  const fromPrimary = normalizeObservationIds(primary ?? []);
  if (fromPrimary.length > 0) {
    return { ids: fromPrimary, filledFromHeuristic: false };
  }
  if (!scores) return { ids: [], filledFromHeuristic: false };
  const fromScores = observationsFromScores(scores);
  return { ids: fromScores, filledFromHeuristic: fromScores.length > 0 };
}

/**
 * اگر منبع اصلی (AI/مدل) تشخیصی نداد، از روی امتیازها پر می‌کند.
 * @deprecated برای آگاهی از fallback از resolveObservations استفاده کنید.
 */
export function ensureObservations(
  primary: string[] | undefined | null,
  scores?: ScoreLikeForObservations | null,
): ObservationId[] {
  return resolveObservations(primary, scores).ids;
}

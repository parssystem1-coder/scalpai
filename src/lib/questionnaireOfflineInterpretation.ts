/**
 * لایهٔ تفسیر آفلاین بر اساس پرسشنامهٔ پزشکی.
 *
 * عمداً امتیازهای عددی اندازه‌گیری (oiliness/density/…) را تغییر نمی‌دهد —
 * فقط پرچم‌های بالینی، توصیه‌های تکمیلی و برچسب اطمینان تفسیر را تولید می‌کند.
 */
import type { OfflineAnalysisResult } from '../db';
import type { QuestionnaireAiContext } from './questionnaireAiContext';
import {
  normalizeQuestionnaireValues,
  type MedicalQuestionnaireStructured,
  type QuestionnaireFieldKey,
} from './medicalQuestionnaireSchema';

export type ClinicalFlagSeverity = 'info' | 'caution' | 'alert';

export interface ClinicalFlag {
  id: string;
  severity: ClinicalFlagSeverity;
  labelFa: string;
  labelEn: string;
}

export interface QuestionnaireInterpretation {
  flags: ClinicalFlag[];
  /** توصیه‌های اضافه‌شده از روی پرسشنامه (نه از پیکسل تصویر) */
  recommendations: string[];
  /** برچسب کوتاه برای UI دربارهٔ اطمینان تفسیر زمینه‌ای */
  confidenceLabelFa: string;
  confidenceLabelEn: string;
}

function selectedOf(
  values: MedicalQuestionnaireStructured,
  field: 'history' | 'medications' | 'previousTreatments',
): Set<string> {
  return new Set(values[field]?.selected ?? []);
}

function hasChange(changed: QuestionnaireFieldKey[], key: QuestionnaireFieldKey): boolean {
  return changed.includes(key);
}

/**
 * تولید پرچم/توصیه از پرسشنامه. خروجی مستقل از امتیازهای تصویر است.
 */
export function interpretQuestionnaireForOffline(
  context: QuestionnaireAiContext | null | undefined,
  isRtl: boolean,
): QuestionnaireInterpretation | null {
  if (!context) return null;
  const values = normalizeQuestionnaireValues(context.values);
  const changed = context.changedFields || [];
  const history = selectedOf(values, 'history');
  const meds = selectedOf(values, 'medications');
  const treatments = selectedOf(values, 'previousTreatments');

  const flags: ClinicalFlag[] = [];
  const recsFa: string[] = [];
  const recsEn: string[] = [];

  const addRec = (fa: string, en: string) => {
    recsFa.push(fa);
    recsEn.push(en);
  };

  if (history.has('thyroid') || meds.has('thyroidMeds')) {
    flags.push({
      id: 'thyroid',
      severity: 'caution',
      labelFa: 'سابقه/درمان تیروئید — چرخهٔ مو ممکن است تحت تأثیر باشد',
      labelEn: 'Thyroid history/treatment — hair cycle may be affected',
    });
    addRec(
      'با توجه به سابقه تیروئید، پیگیری غدد/آزمایش‌های مرتبط را در کنار مراقبت پوست سر در نظر بگیرید',
      'Given thyroid history, consider endocrine follow-up alongside scalp care',
    );
  }

  if (history.has('pcos') || history.has('hormonal') || meds.has('contraceptives')) {
    flags.push({
      id: 'hormonal',
      severity: 'caution',
      labelFa: 'زمینهٔ هورمونی — الگوی ریزش ممکن است هورمونی باشد',
      labelEn: 'Hormonal background — loss pattern may be endocrine-related',
    });
    addRec(
      'زمینه هورمونی گزارش شده: ارزیابی الگوی زنانه/آندروژنیک و هماهنگی با پزشک معالج توصیه می‌شود',
      'Reported hormonal background: assess female/androgenetic pattern with the treating clinician',
    );
  }

  if (history.has('anemia')) {
    flags.push({
      id: 'anemia',
      severity: 'info',
      labelFa: 'سابقه کم‌خونی — وضعیت تغذیه‌ای مرتبط با مو',
      labelEn: 'Anemia history — nutrition may affect hair',
    });
    addRec(
      'سابقه کم‌خونی: بررسی آهن/فریتین و تغذیه را در برنامه پیگیری بگنجانید',
      'Anemia history: include iron/ferritin and nutrition review in follow-up',
    );
  }

  if (history.has('diabetes')) {
    flags.push({
      id: 'diabetes',
      severity: 'caution',
      labelFa: 'دیابت — احتیاط در تفسیر التهاب/عفونت پوست سر',
      labelEn: 'Diabetes — interpret scalp inflammation/infection cautiously',
    });
    addRec(
      'در زمینه دیابت، نشانه‌های التهاب یا عفونت پوست سر را با حساسیت بیشتر پیگیری کنید',
      'With diabetes, follow scalp inflammation or infection signs more carefully',
    );
  }

  if (history.has('autoimmune')) {
    flags.push({
      id: 'autoimmune',
      severity: 'alert',
      labelFa: 'بیماری خودایمنی — ارجاع تخصصی در اولویت',
      labelEn: 'Autoimmune disease — specialist referral prioritized',
    });
    addRec(
      'سابقه خودایمنی: در صورت یافته‌های لکه‌ای یا التهابی، ارجاع به متخصص پوست/تریکولوژیست ضروری است',
      'Autoimmune history: if patchy or inflammatory findings appear, dermatology/trichology referral is warranted',
    );
  }

  if (history.has('scalpInfection')) {
    flags.push({
      id: 'scalpInfection',
      severity: 'caution',
      labelFa: 'سابقه عفونت پوست سر',
      labelEn: 'Prior scalp infection history',
    });
  }

  if (meds.has('minoxidil') || treatments.has('minoxidilTopical')) {
    flags.push({
      id: 'onMinoxidil',
      severity: 'info',
      labelFa: 'در حال استفاده از ماینوکسیدیل',
      labelEn: 'Currently using minoxidil',
    });
    addRec(
      'ماینوکسیدیل در مصرف فعلی گزارش شده: بر تداوم مصرف منظم و ارزیابی پاسخ در مراجعات بعدی تمرکز کنید (شروع مجدد پیشنهاد نشود)',
      'Minoxidil already reported: focus on adherence and response over visits (do not suggest restarting)',
    );
  }

  if (meds.has('finasteride')) {
    flags.push({
      id: 'onFinasteride',
      severity: 'info',
      labelFa: 'در حال استفاده از فیناستراید/دوتاستراید',
      labelEn: 'Currently using finasteride/dutasteride',
    });
    addRec(
      'مهارکننده ۵α-ریدوکتاز در مصرف است: توصیه‌ها را با رژیم دارویی فعلی هماهنگ و از تداخل پیشنهادی خودداری کنید',
      '5α-reductase inhibitor in use: align advice with current regimen and avoid conflicting suggestions',
    );
  }

  if (meds.has('steroids')) {
    flags.push({
      id: 'steroids',
      severity: 'caution',
      labelFa: 'مصرف کورتون/استروئید — تفسیر التهاب با احتیاط',
      labelEn: 'Steroid use — interpret inflammation cautiously',
    });
  }

  if (treatments.has('transplant')) {
    flags.push({
      id: 'transplant',
      severity: 'info',
      labelFa: 'سابقه کاشت مو — ناحیه اهدا/گیرنده را جدا تفسیر کنید',
      labelEn: 'Hair transplant history — interpret donor/recipient zones separately',
    });
  }

  if (treatments.has('prp') || treatments.has('mesotherapy')) {
    flags.push({
      id: 'recentIntervention',
      severity: 'info',
      labelFa: 'مداخله اخیر (PRP/مزوتراپی) ممکن است ظاهر فعلی را تغییر دهد',
      labelEn: 'Recent PRP/mesotherapy may alter current appearance',
    });
  }

  if (values.stressLevel === 'high') {
    flags.push({
      id: 'highStress',
      severity: 'caution',
      labelFa: 'استرس بالا — احتمال تلوژن افلوویوم',
      labelEn: 'High stress — possible telogen effluvium contribution',
    });
    addRec(
      'استرس بالا گزارش شده: مدیریت استرس و پیگیری الگوی منتشر ریزش را در توصیه‌ها در نظر بگیرید',
      'High stress reported: include stress management and watch for diffuse shedding patterns',
    );
  }

  if (values.sleepQuality === 'poor') {
    addRec(
      'کیفیت خواب ضعیف: بهداشت خواب را به‌عنوان عامل کمکی در برنامه مراقبت بگنجانید',
      'Poor sleep quality: include sleep hygiene as supportive care',
    );
  }

  if ((values.allergies || '').trim()) {
    flags.push({
      id: 'allergies',
      severity: 'alert',
      labelFa: 'آلرژی ثبت‌شده — قبل از محصول جدید بررسی شود',
      labelEn: 'Recorded allergies — verify before new products',
    });
    addRec(
      'آلرژی ثبت شده است: قبل از معرفی هر محصول جدید، سازگاری با حساسیت‌های مراجع را بررسی کنید',
      'Allergies are recorded: verify compatibility before introducing any new product',
    );
  }

  if (hasChange(changed, 'medications') || hasChange(changed, 'previousTreatments')) {
    flags.push({
      id: 'regimenChanged',
      severity: 'caution',
      labelFa: 'تغییر دارو/درمان نسبت به مراجعه قبل',
      labelEn: 'Medication/treatment changed since previous visit',
    });
    addRec(
      'نسبت به مراجعه قبل دارو یا درمان تغییر کرده: پاسخ کوتاه‌مدت را در این ویزیت جداگانه ارزیابی کنید',
      'Medications/treatments changed since last visit: evaluate short-term response separately this visit',
    );
  }

  if (hasChange(changed, 'stressLevel') && values.stressLevel === 'high') {
    flags.push({
      id: 'stressIncreased',
      severity: 'info',
      labelFa: 'افزایش استرس نسبت به مراجعه قبل',
      labelEn: 'Stress increased versus previous visit',
    });
  }

  const hasContent =
    flags.length > 0 ||
    recsFa.length > 0 ||
    Boolean(values.age || values.gender) ||
    history.size > 0 ||
    meds.size > 0 ||
    treatments.size > 0;

  if (!hasContent && !context.revisionId) return null;

  let confidenceLabelFa = 'بدون زمینهٔ پرسشنامه';
  let confidenceLabelEn = 'No questionnaire context';
  if (context.status === 'final' && (flags.length > 0 || recsFa.length > 0)) {
    confidenceLabelFa = 'تفسیر با زمینهٔ پرسشنامهٔ نهایی‌شده';
    confidenceLabelEn = 'Interpretation with finalized questionnaire context';
  } else if (context.status === 'draft' && (flags.length > 0 || recsFa.length > 0)) {
    confidenceLabelFa = 'پرسشنامه پیش‌نویس — اطمینان زمینه متوسط';
    confidenceLabelEn = 'Draft questionnaire — moderate context confidence';
  } else if (context.revisionId) {
    confidenceLabelFa = 'پرسشنامه موجود بدون پرچم فعال';
    confidenceLabelEn = 'Questionnaire present without active flags';
  }

  return {
    flags,
    recommendations: isRtl ? recsFa : recsEn,
    confidenceLabelFa,
    confidenceLabelEn,
  };
}

/**
 * اعمال لایهٔ تفسیر روی نتیجهٔ آفلاین — بدون دست زدن به امتیازها/کادرها/نمودار.
 */
export function applyQuestionnaireToOfflineResult(
  result: OfflineAnalysisResult,
  context: QuestionnaireAiContext | null | undefined,
  isRtl: boolean,
): OfflineAnalysisResult {
  const interpretation = interpretQuestionnaireForOffline(context, isRtl);
  if (!context && !interpretation) return result;

  const questionnaireRecs = interpretation?.recommendations ?? [];
  // توصیه‌های زمینه‌ای اول می‌آیند تا در UI دیده شوند؛ امتیازها دست‌نخورده می‌مانند
  const recommendations = questionnaireRecs.length
    ? [...questionnaireRecs, ...(result.recommendations || [])]
    : result.recommendations;

  return {
    ...result,
    recommendations,
    questionnaireContext: context
      ? { ...context, includedInPrompt: false }
      : result.questionnaireContext,
    questionnaireInterpretation: interpretation ?? undefined,
  };
}

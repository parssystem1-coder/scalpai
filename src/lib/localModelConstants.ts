/**
 * ثابت‌های مدل محلی — جدا از TensorFlow.js تا UI کل باندل TF را نکشد.
 */
export const MIN_SAMPLES_TO_TRAIN = 20;
/** حداقل نمونهٔ تأییدشده / متخصص برای شروع آموزش */
export const MIN_QUALITY_SAMPLES = 8;
export const TRAIN_EPOCHS = 120;
export const EARLY_STOP_PATIENCE = 12;
export const HOLDOUT_CLIENT_RATIO = 0.15;
export const VAL_CLIENT_RATIO = 0.2;
export const MODEL_ARCHITECTURE = 'mlp_multitask_v2';

/**
 * فاز ۰ — حاشیهٔ تحمل گیت champion/challenger برای بازآموزی هم‌نسخه (v3→v3).
 * مدل جدید فقط وقتی جایگزین مدل فعال می‌شود که در holdout بدتر از این حاشیه نباشد.
 */
export const RETRAIN_MAE_TOLERANCE = 0.5;
export const RETRAIN_F1_TOLERANCE = 0.03;

/**
 * فاز ۲٫۴ — تعداد اجرای holdout با seedهای متفاوت برای سنجش پایداری متریک.
 * عدد کم انتخاب شده چون هر اجرا یک آموزش کامل است و در مرورگر انجام می‌شود.
 */
export const REPEATED_HOLDOUT_RUNS = 3;

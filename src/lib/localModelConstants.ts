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

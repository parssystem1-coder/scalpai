export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: 'male' | 'female';
  birthDate: string;
  notes: string;
  /**
   * true فقط برای ردیف ثابت و سیستمی «استخر تصاویر آموزشی»
   * (id ثابت 'system-training-pool') — هرگز در فهرست/جستجوی مشتریان واقعی
   * ظاهر نمی‌شود؛ فقط برای عبور از قید FOREIGN KEY(clientId) روی جدول
   * gallery لازم است. کاربر هرگز این فیلد را تنظیم نمی‌کند.
   */
  isSystemRecord?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TrainingPoolStatus = 'active' | 'completed';

export interface GalleryItem {
  id: string;
  clientId: string;
  type: 'photo' | 'video';
  url: string;
  thumbnail?: string;
  filename: string;
  filePath?: string; // مسیر فایل روی دیسک (فقط در Electron)
  createdAt: string;
  metadata?: Record<string, unknown>;
  /** Persisted lifecycle state for system training-pool items only. */
  trainingPoolStatus?: TrainingPoolStatus;
}

export interface Session {
  id: string;
  clientId: string;
  trichologistId: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string;
  createdAt: string;
}

/**
 * پرسشنامهٔ پزشکی یک مراجعه (نوبت) — یک ردیف به‌ازای هر نوبت.
 * status = 'draft' یعنی در حال تکمیل؛ 'final' یعنی ثبت نهایی‌شده.
 * changedFields فقط هنگام ثبت نهایی نسبت به final مراجعهٔ قبل محاسبه می‌شود.
 */
export interface QuestionnaireRevision {
  id: string;
  clientId: string;
  sessionId: string;
  status: 'draft' | 'final';
  values: Record<string, unknown>;
  /** کلید فیلدهایی که نسبت به final قبلی تغییر کرده‌اند */
  changedFields?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Trichologist {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  description: string;
  active: boolean;
}

export interface Analysis {
  id: string;
  clientId: string;
  /** پیوند به نوبت/جلسه — چند عکس یک مراجعه همین شناسه را دارند */
  sessionId?: string;
  trichologistId?: string;
  type: 'trichologist' | 'ai' | 'offline';
  galleryItemId?: string;
  medicalQuestionnaire?: Record<string, unknown>;
  observations?: string[];
  recommendations?: string;
  treatmentPlan?: string;
  aiResults?: AIAnalysisResult;
  offlineResults?: OfflineAnalysisResult;
  createdAt: string;
  updatedAt: string;
}

export interface LesionSummaryRegion {
  regionId: string | null;
  affectedPhotoCount: number;
  affectedPhotoRegionCount: number;
  occurrenceCount: number;
  averageConfidence: number;
  maxConfidence: number;
}

export interface LesionSummaryItem {
  type: string;
  category?: LesionCategory;
  evidenceLevel?: LesionEvidenceLevel;
  affectedPhotoCount: number;
  affectedPhotoRegionCount: number;
  occurrenceCount: number;
  averageConfidence: number;
  maxConfidence: number;
  regions: LesionSummaryRegion[];
}

export interface LesionSummary {
  global: LesionSummaryItem[];
  byRegion: LesionSummaryRegion[];
  itemsByRegion: Record<string, LesionSummaryItem[]>;
  itemsByRegionAndLens: Record<string, Record<string, LesionSummaryItem[]>>;
  availableRegionIds: string[];
  availableLensModes: string[];
}

export type LesionCategory = 'condition' | 'trichoscopy';
export type LesionEvidenceLevel = 'observed' | 'possible' | 'requires_confirmation';
export interface LesionAnnotation {
  type: string;
  confidence: number;
  bbox: number[];
  category?: LesionCategory;
  evidenceLevel?: LesionEvidenceLevel;
}

export interface AIAnalysisResult {
  lesions: LesionAnnotation[];
  /** خلاصهٔ یکتا برای نمودار/گزارش چندتصویری — occurrence خام همچنان در lesions حفظ می‌شود */
  lesionSummary?: LesionSummary;
  /** شناسه‌های کاتالوگ تشخیص کلینیکی (همان observationOptions) */
  observations?: string[];
  hairDensity: { level: string; score: number };
  scalpCondition: { oiliness: number; dryness: number; redness?: number; dandruff?: number; shine?: number; patchiness?: number; pigmentation?: number; hairThickness?: number };
  hairLoss: { level: string; pattern: string };
  recommendations: string[];
  /** نمودار میله‌ای — همان ساختار نتایج آفلاین */
  chartData?: { label: string; value: number }[];
  /**
   * تصویر با کادر ضایعات — برای نمایش در آرشیو/تاریخچه.
   * توجه: در پاسخ‌های *لیستی* حذف می‌شود (payload سنگین می‌شد) و به‌جایش
   * hasAnnotatedImage ست می‌گردد. برای گرفتن خودِ تصویر از
   * db.getAnalysisAnnotatedImage(analysisId) استفاده کنید.
   */
  annotatedImageBase64?: string;
  /** در پاسخ لیستی: یعنی تصویر annotate‌شده وجود دارد ولی ارسال نشده */
  hasAnnotatedImage?: boolean;
  /**
   * true وقتی آرایهٔ observations از قوانین آستانه‌ای heuristic پر شده
   * چون مدل/AI شناسهٔ کاتالوگ برنگردانده است.
   */
  observationsFilledFromHeuristic?: boolean;
  /** Context sent to the remote AI as part of its clinical prompt. */
  acquisitionContext?: import('../lib/analysisAcquisitionContext').AnalysisAcquisitionContext;
  /**
   * Snapshot پرسشنامهٔ پزشکی لینک‌شده به این تحلیل.
   * includedInPrompt مشخص می‌کند آیا داده واقعاً به سرویس ابری ارسال شده یا نه.
   */
  questionnaireContext?: import('../lib/questionnaireAiContext').QuestionnaireAiContext;
  /** لایهٔ تفسیر آفلاین؛ برای AI معمولاً خالی است */
  questionnaireInterpretation?: import('../lib/questionnaireOfflineInterpretation').QuestionnaireInterpretation;
}

export interface OfflineAnalysisResult {
  lesions: LesionAnnotation[];
  /** خلاصهٔ یکتا برای نمودار/گزارش چندتصویری — occurrence خام همچنان در lesions حفظ می‌شود */
  lesionSummary?: LesionSummary;
  /** شناسه‌های کاتالوگ تشخیص کلینیکی (همان observationOptions) */
  observations?: string[];
  hairDensity: { level: string; score: number };
  scalpCondition: {
    oiliness: number;
    dryness: number;
    redness?: number;
    dandruff?: number;
    // شاخص‌های تخصصی‌تر (heuristic/مدل محلی/AI)
    shine?: number;
    patchiness?: number;
    pigmentation?: number;
    hairThickness?: number;
  };
  hairLoss: { level: string; pattern: string };
  recommendations: string[];
  metrics?: {
    brightness: number;
    rednessRatio: number;
    whiteFlakeRatio: number;
    textureVariance: number;
    hairCoverageRatio?: number;
    shineRatio?: number;
    edgeDensity?: number;
    patchinessRaw?: number;
    pigmentationRaw?: number;
  };
  chartData?: { label: string; value: number }[];
  /** در پاسخ‌های لیستی حذف می‌شود — به getAnalysisAnnotatedImage مراجعه کنید */
  annotatedImageBase64?: string;
  /** در پاسخ لیستی: یعنی تصویر annotate‌شده وجود دارد ولی ارسال نشده */
  hasAnnotatedImage?: boolean;
  engine?: 'python' | 'browser' | 'model';
  /**
   * true وقتی آرایهٔ observations از قوانین آستانه‌ای heuristic پر شده
   * چون موتور شناسهٔ کاتالوگ برنگردانده است.
   */
  observationsFilledFromHeuristic?: boolean;
  /**
   * فاز ۱ — ارزیابی کیفیت تصویر ورودی خام (تار/کم‌نور/پرنور/کم‌کنتراست).
   * فقط هشدار برای کاربر است؛ تحلیل را مسدود نمی‌کند.
   */
  imageQuality?: {
    blurVariance: number;
    meanBrightness: number;
    brightnessStd: number;
    isBlurry: boolean;
    isTooDark: boolean;
    isTooBright: boolean;
    isLowContrast: boolean;
    hasIssue: boolean;
  };
  /** Context actually used to interpret this image during analysis. */
  acquisitionContext?: import('../lib/analysisAcquisitionContext').AnalysisAcquisitionContext;
  /** Snapshot پرسشنامه لینک‌شده به این تحلیل آفلاین */
  questionnaireContext?: import('../lib/questionnaireAiContext').QuestionnaireAiContext;
  /**
   * پرچم‌ها/توصیه‌های زمینه‌ای از پرسشنامه — امتیازهای عددی را تغییر نمی‌دهد.
   */
  questionnaireInterpretation?: import('../lib/questionnaireOfflineInterpretation').QuestionnaireInterpretation;
}


/** شکل مشترک نتایج AI / آفلاین برای UI گزارش */
export type ClinicalAnalysisResult = AIAnalysisResult | OfflineAnalysisResult;

// =============== یادگیری ماشین محلی ===============

// همان فیچرهای خام تصویر که در src/lib/scalpFeatures.ts محاسبه می‌شوند.
// نکته: نمونه‌های آموزشی ذخیره‌شده با نسخهٔ قدیمی‌تر فیچر ممکن است این
// فیلدهای جدید را نداشته باشند — این مورد به‌صورت دفاعی (پیش‌فرض ۰) در
// featureVectorToArray مدیریت می‌شود، نه با optional-کردن نوع.
export interface ScalpFeatureSnapshot {
  brightness: number;
  whiteFlakeRatio: number;
  rednessRatio: number;
  hairCoverageRatio: number;
  textureVariance: number;
  avgR: number;
  avgG: number;
  avgB: number;
  shineRatio: number;
  edgeDensity: number;
  patchinessRaw: number;
  pigmentationRaw: number;
}

export interface TrainingSampleLabel {
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
  densityScore: number;
  // شاخص‌های تخصصی‌تر — اختیاری چون منبع online_ai (Gemini) این‌ها را برنمی‌گرداند
  // و فقط موتور heuristic/برچسب‌گذاری دستی متخصص آن‌ها را پر می‌کند
  shine?: number;
  patchiness?: number;
  pigmentation?: number;
  hairThickness?: number;
  hairLossLevel?: string;
  hairDensityLevel?: string;
  lesions?: { type: string; confidence: number; bbox?: number[] }[];
  /** شناسه‌های تشخیص کلینیکی از کاتالوگ مشترک — برای آموزش چندبرچسبی مدل محلی */
  observations?: string[];
}

export type TrainingLabelSource = 'online_ai' | 'expert' | 'offline_heuristic';

export interface TrainingSample {
  id: string;
  clientId?: string;
  galleryItemId?: string;
  imageThumbnail?: string;
  features: ScalpFeatureSnapshot;
  /**
   * بردار پرسشنامه برای آزمایش مدل v4 — فقط وقتی پر باشد در مقایسهٔ holdout شرکت می‌کند.
   * مدل فعال تا وقتی v4 برتری اثبات‌شده نداشته باشد همان v3 (تصویر-فقط) می‌ماند.
   */
  questionnaireFeatures?: number[];
  label: TrainingSampleLabel;
  labelSource: TrainingLabelSource;
  confidence?: number;
  usedInTraining?: boolean;
  modelVersionTrainedWith?: number;
  createdAt: string;
  /** نسخهٔ فرمول فیچر هنگام ذخیرهٔ نمونه */
  featureVersion?: string;
  /**
   * برای نمونه‌های AI: فقط پس از تأیید متخصص وارد آموزش باکیفیت می‌شوند.
   * نمونه‌های expert به‌صورت پیش‌فرض true هستند.
   */
  approvedForTraining?: boolean;
}

/** فیلدهای قابل ویرایش نمونهٔ آموزشی (تأیید AI یا تصحیح برچسب توسط متخصص) */
export type TrainingSampleUpdatePatch = Partial<Pick<TrainingSample,
  | 'approvedForTraining'
  | 'featureVersion'
  | 'questionnaireFeatures'
  | 'label'
  | 'labelSource'
  | 'confidence'
  | 'usedInTraining'
  | 'clientId'
  | 'galleryItemId'
>>;

export interface LocalModelMetricsSnapshot {
  maeScores?: number;
  obsF1?: number;
  loss?: number;
}

export interface LocalModelVersionInfo {
  version: number;
  trainedAt: string;
  sampleCount: number;
  featureVersion?: string;
  architecture?: string;
  valLoss?: number;
  valMaeScores?: number;
  valObsF1?: number;
  holdoutMae?: number;
  holdoutObsF1?: number;
  seed?: number;
  datasetHash?: string;
  evaluation?: import('../lib/localModel').LocalModelSplitSummary;
}

/** نتیجهٔ آزمایش مشروط مدل v4 (تصویر+پرسشنامه) در برابر تصویر-فقط */
export interface LocalModelV4Experiment {
  attempted: boolean;
  promoted: boolean;
  reason: string;
  questionnaireSampleCount: number;
  questionnaireClientCount: number;
  imageOnlyHoldoutMae?: number;
  imageOnlyHoldoutObsF1?: number;
  v4HoldoutMae?: number;
  v4HoldoutObsF1?: number;
}

export interface LocalModelMetadata {
  version: number;
  trainedAt: string;
  sampleCount: number;
  sampleCountBySource?: Record<string, number>;
  loss?: number;
  valLoss?: number;
  featureVersion?: string;
  architecture?: string;
  epochsRun?: number;
  maeScores?: number;
  valMaeScores?: number;
  obsF1?: number;
  valObsF1?: number;
  holdoutMae?: number;
  holdoutObsF1?: number;
  seed?: number;
  datasetHash?: string;
  evaluation?: import('../lib/localModel').LocalModelSplitSummary;
  featureMeans?: number[];
  featureStds?: number[];
  /** آرشیو نسخه‌های قبلی برای rollback نمایشی */
  history?: LocalModelVersionInfo[];
  /** آخرین آزمایش مقایسه‌ای v4 در برابر تصویر-فقط */
  v4Experiment?: LocalModelV4Experiment;
  /** فاز ۰.۱ — نتیجهٔ آخرین گیت champion/challenger هنگام جایگزینی مدل */
  championGate?: import('../lib/localModel').ChampionGateResult;
}

export interface Settings {
  language: 'fa' | 'en';
  theme: 'dark' | 'blue' | 'purple' | 'cyber' | 'mint' | 'neural' | 'mintAi' | 'quantum';
  aiApiKey?: string;
  /** فقط در پاسخ getSettings — نشان می‌دهد کلید API ذخیره شده (بدون افشای خود کلید) */
  hasApiKey?: boolean;
  aiProvider?: 'gemini' | 'openai_compatible'; // نوع سرویس هوش مصنوعی — کاربر می‌تواند هر سرویس سازگار با OpenAI را وصل کند
  aiModelName?: string;
  aiBaseUrl?: string;
  /** شناسهٔ preset انتخاب‌شده (gemini-flash / openrouter-free / groq-free / custom) — برای نمایش عمومی «مدل ۱…۴» */
  aiPresetId?: string;
  aiProxyUrl?: string; // پراکسیِ اختصاصیِ خودِ کاربر برای نسخهٔ وب (اختیاری - هیچ پراکسی عمومی به‌طور پیش‌فرض استفاده نمی‌شود)
  proxyUrl?: string; // System proxy for Electron (Iran filtering bypass)
  aiConfidenceThreshold: number;
  /**
   * رضایت صریح برای ارسال سن/جنسیت/پرسشنامهٔ پزشکی به سرویس هوش مصنوعی ابری.
   * پیش‌فرض false — بدون رضایت فقط تصویر و زمینهٔ لنز/ناحیه ارسال می‌شود.
   */
  includeMedicalDataInAi?: boolean;
  backupPath?: string;
  username?: string;
  password?: string;
  passwordHash?: string;
  hasPassword?: boolean;
  firstName?: string;
  lastName?: string;
  useLocalModel?: boolean; // استفاده از مدل محلی آموزش‌دیده در تحلیل آفلاین (در صورت وجود)
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

// پارامترهای Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface GalleryQueryParams {
  limit?: number;
  offset?: number;
  clientId?: string;
  type?: 'photo' | 'video';
  search?: string;
  startDate?: string;
  endDate?: string;
  regionId?: string;
  trichoscopeMode?: string;
}

export interface TrainingPoolQueryParams {
  status: TrainingPoolStatus;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  regionId?: string;
}

// نتیجه Paginated
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface DatabaseAdapter {
  init(): Promise<void>;

  // Clients with Pagination
  getClients(params?: PaginationParams): Promise<Client[]>;
  getClientsCount(search?: string): Promise<number>;
  getClient(id: string): Promise<Client | null>;
  createClient(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client>;
  updateClient(id: string, patch: Partial<Client>): Promise<Client>;
  deleteClient(id: string): Promise<void>;

  // Gallery with Pagination
  getGalleryByClient(clientId: string, params?: PaginationParams): Promise<GalleryItem[]>;
  getAllGallery(params?: PaginationParams): Promise<GalleryItem[]>;
  getGalleryPage(params?: GalleryQueryParams): Promise<GalleryItem[]>;
  getGalleryPageCount(params?: Omit<GalleryQueryParams, 'limit' | 'offset'>): Promise<number>;
  getGalleryCount(clientId?: string): Promise<number>;
  /**
   * محتوای کامل یک آیتم گالری به‌صورت data URL.
   * لیست‌ها فقط thumbnail سبک برمی‌گردانند؛ پیش‌نمایش/تحلیل/دانلود
   * محتوای کامل را با این متد on-demand می‌گیرند.
   */
  getGalleryItemDataUrl(id: string): Promise<string | null>;
  addGalleryItem(clientId: string, item: Omit<GalleryItem, 'id' | 'createdAt'>): Promise<GalleryItem>;
  deleteGalleryItem(id: string): Promise<void>;
  getTrainingPoolItems(params: TrainingPoolQueryParams): Promise<GalleryItem[]>;
  getTrainingPoolItemsCount(params: Omit<TrainingPoolQueryParams, 'limit' | 'offset'>): Promise<number>;
  updateTrainingPoolItemStatus(id: string, status: TrainingPoolStatus): Promise<void>;

  // Sessions (صفحه‌بندی اختیاری — بدون پارامتر، همهٔ ردیف‌ها برمی‌گردد)
  getSessions(params?: PaginationParams): Promise<Session[]>;
  getSessionsCount(): Promise<number>;
  getSessionsByClient(clientId: string): Promise<Session[]>;
  createSession(data: Omit<Session, 'id' | 'createdAt'>): Promise<Session>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // پرسشنامهٔ پزشکی هر مراجعه — منبع حقیقت واحد (به‌جای localStorage)
  getQuestionnaireRevisionsByClient(clientId: string): Promise<QuestionnaireRevision[]>;
  getQuestionnaireRevision(clientId: string, sessionId: string): Promise<QuestionnaireRevision | null>;
  /**
   * آخرین نسخهٔ final ثبت‌شده برای مشتری.
   * اگر excludeSessionId داده شود، همان نوبت از نتیجه حذف می‌شود (برای Diff با مراجعهٔ قبل).
   */
  getPreviousFinalQuestionnaireRevision(
    clientId: string,
    excludeSessionId?: string,
  ): Promise<QuestionnaireRevision | null>;
  /** Upsert بر اساس (clientId, sessionId) — status/changedFields فقط وقتی صریح داده شوند اعمال می‌شوند */
  saveQuestionnaireRevision(input: {
    clientId: string;
    sessionId: string;
    values: Record<string, unknown>;
    status?: QuestionnaireRevision['status'];
    changedFields?: string[];
  }): Promise<QuestionnaireRevision>;

  // Trichologists
  getTrichologists(): Promise<Trichologist[]>;
  createTrichologist(data: Omit<Trichologist, 'id'>): Promise<Trichologist>;
  updateTrichologist(id: string, patch: Partial<Trichologist>): Promise<Trichologist>;
  deleteTrichologist(id: string): Promise<void>;

  // Analyses (صفحه‌بندی اختیاری — بدون پارامتر، همهٔ ردیف‌ها برمی‌گردد)
  getAnalyses(params?: PaginationParams): Promise<Analysis[]>;
  getAnalysesCount(): Promise<number>;
  getAnalysesByClient(clientId: string): Promise<Analysis[]>;
  /**
   * تصویر annotate‌شدهٔ یک تحلیل (data URL) — on-demand.
   * لیست‌ها این تصویر را حمل نمی‌کنند تا حافظه/IPC سبک بماند.
   */
  getAnalysisAnnotatedImage(id: string): Promise<string | null>;
  createAnalysis(data: Omit<Analysis, 'id' | 'createdAt' | 'updatedAt'>): Promise<Analysis>;
  updateAnalysis(id: string, patch: Partial<Analysis>): Promise<Analysis>;
  deleteAnalysis(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  // Import/Export
  exportData(): Promise<string>;
  importData(jsonData: string): Promise<void>;

  // Auth
  verifyCredentials(username: string, password: string): Promise<boolean>;
  hasCredentials(): Promise<boolean>;

  // یادگیری ماشین محلی — نمونه‌های آموزشی (برچسب خودکار AI + برچسب دستی متخصص)
  getTrainingSamples(): Promise<TrainingSample[]>;
  addTrainingSample(data: Omit<TrainingSample, 'id' | 'createdAt' | 'usedInTraining'>): Promise<TrainingSample>;
  saveTrainingSampleAndCompletePoolItem(data: Omit<TrainingSample, 'id' | 'createdAt' | 'usedInTraining'>): Promise<TrainingSample>;
  updateTrainingSample(id: string, patch: TrainingSampleUpdatePatch): Promise<TrainingSample>;
  deleteTrainingSample(id: string): Promise<void>;
  markTrainingSamplesUsed(ids: string[], modelVersion: number): Promise<void>;
  getModelMetadata(): Promise<LocalModelMetadata | null>;
  updateModelMetadata(patch: Partial<LocalModelMetadata>): Promise<LocalModelMetadata>;
  clearModelMetadata(): Promise<void>;
}

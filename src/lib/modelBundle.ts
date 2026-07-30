/**
 * modelBundle — کدک خالص برای بسته‌بندی مدل TF.js داخل بکاپ (موج ۳ / O3)
 * -----------------------------------------------------------------------
 * هدف: مدل آموزش‌دیدهٔ محلی (در IndexedDB) با بکاپ کلینیک سفر کند، وگرنه پاک
 * شدن پروفایل = نابودی بی‌صدأ مدل. این ماژول **هیچ وابستگی به tf.io ندارد**
 * (توابع خالص روی modelArtifacts) تا در vitest بدون مرورگر کامل تست شود.
 * توابع سمت I/O (خواندن/نوشتن IndexedDB) در localModel.ts هستند.
 *
 * فرمت بسته (در ZIP به‌صورت model.json + model.weights.bin و در envelope
 * JSON به‌صورت فیلد modelBundle):
 *   { modelTopology, weightSpecs, weightDataBase64, featureVersion, metadata }
 */

/** ساختار بستهٔ مدل داخل بکاپ */
export interface LocalModelBackupBundle {
  /** topology لایه‌ها (modelArtifacts.modelTopology) */
  modelTopology: Record<string, unknown>;
  /** مشخصات وزن‌ها (modelArtifacts.weightSpecs) */
  weightSpecs: Array<Record<string, unknown>>;
  /** بایت‌های وزن‌ها به‌صورت base64 */
  weightDataBase64: string;
  /** نسخهٔ فیچری که مدل با آن آموزش دیده — برای هشدار ناسازگاری در UI */
  featureVersion?: string | null;
  /** LocalModelMetadata هنگام خروجی (میانگین/انحراف فیچرها، آستانه‌ها و…) */
  metadata?: Record<string, unknown> | null;
  /** زمان خروجی برای نمایش در کارت challenger */
  exportedAt?: string;
}

/** ساختار خروجی رمزگشایی برای تحویل به tf.io.fromMemory */
export interface BundleArtifacts {
  modelTopology: Record<string, unknown>;
  weightSpecs: Array<Record<string, unknown>>;
  weightData: ArrayBuffer;
}

/** آمار بایت مدل — برای نمایش حجم در UI و محدودیت سقف */
export function bundleWeightBytes(bundle: LocalModelBackupBundle): number {
  // base64 هر ۴ کاراکتر = ۳ بایت
  return Math.floor(bundle.weightDataBase64.length * 3 / 4);
}

/** سقف دفاعی اندازهٔ مدل (معماری فعلی صدها کیلوبایت است؛ ۳۲ مگابایت = قطعاً خطا) */
export const MAX_MODEL_WEIGHT_BYTES = 32 * 1024 * 1024;

/**
 * اعتبارسنجی ساختاری بستهٔ مدل — نسخهٔ renderer از همان قواعد parseBackupPayload
 * در db-common.cjs + بررسی سقف اندازه (دفاع در برابر پیلود دست‌کاری‌شده).
 */
export function isValidModelBundle(bundle: unknown): bundle is LocalModelBackupBundle {
  if (!bundle || typeof bundle !== 'object') return false;
  const b = bundle as Partial<LocalModelBackupBundle>;
  if (typeof b.modelTopology !== 'object' || b.modelTopology === null) return false;
  if (!Array.isArray(b.weightSpecs)) return false;
  if (typeof b.weightDataBase64 !== 'string') return false;
  return bundleWeightBytes(b as LocalModelBackupBundle) <= MAX_MODEL_WEIGHT_BYTES;
}

/**
 * ArrayBuffer → base64 به‌صورت خُرده‌خُرده (بدون String.fromCharCode(...spread)
 * که روی آرایه‌های بزرگ stack overflow می‌دهد).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  // btoa در renderer موجود است؛ در محیط node (تست) با Buffer می‌سازیم
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

/** base64 → ArrayBuffer (رفت و برگشت بایت‌دقیق) */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  const buf = Buffer.from(base64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * ساخت بسته از modelArtifacts (خروجی model.save / tf.io.withSaveHandler).
 */
export function artifactsToBundle(
  artifacts: {
    modelTopology: Record<string, unknown>;
    weightSpecs: Array<Record<string, unknown>>;
    weightData: ArrayBuffer;
  },
  meta: { featureVersion?: string | null; metadata?: Record<string, unknown> | null } = {},
): LocalModelBackupBundle {
  return {
    modelTopology: artifacts.modelTopology,
    weightSpecs: artifacts.weightSpecs,
    weightDataBase64: arrayBufferToBase64(artifacts.weightData),
    featureVersion: meta.featureVersion ?? null,
    metadata: meta.metadata ?? null,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * باز کردن بسته به آرتیفکت‌های قابل‌مصرف برای tf.io.fromMemory.
 * روی بستهٔ نامعتبر/نامتعارف خطا می‌اندازد (نه نتیجهٔ نیمه‌کاره).
 */
export function bundleToArtifacts(bundle: LocalModelBackupBundle): BundleArtifacts {
  if (!isValidModelBundle(bundle)) throw new Error('Invalid model bundle');
  return {
    modelTopology: bundle.modelTopology,
    weightSpecs: bundle.weightSpecs,
    weightData: base64ToArrayBuffer(bundle.weightDataBase64),
  };
}

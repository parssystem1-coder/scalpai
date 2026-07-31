/**
 * تست کدک بستهٔ مدل داخل بکاپ (موج ۳ / O3) — توابع خالص، بدون tf.io.
 * I/O واقعی IndexedDB (indexeddb://scalpai-local-model-challenger) همان
 * مکانیزم موجود ذخیره/بازگردانی مدل است که از قبل در تولید استفاده می‌شود.
 */
import { describe, it, expect } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  artifactsToBundle,
  bundleToArtifacts,
  isValidModelBundle,
  bundleWeightBytes,
  MAX_MODEL_WEIGHT_BYTES,
  type LocalModelBackupBundle,
} from './modelBundle';

function makeArtifacts(size = 1024) {
  const weightData = new ArrayBuffer(size);
  const view = new Uint8Array(weightData);
  for (let i = 0; i < view.length; i += 1) view[i] = (i * 37 + 11) % 256;
  return {
    modelTopology: { class_name: 'Sequential', config: { layers: [{ class_name: 'Dense' }] } },
    weightSpecs: [{ name: 'dense/kernel', shape: [8, 4], dtype: 'float32' }],
    weightData,
  };
}

describe('modelBundle codec (موج ۳/O3)', () => {
  it('base64 round-trip بایت‌دقیق است (از جمله بایت‌های ۰ و ۲۵۵)', () => {
    const buf = new Uint8Array([0, 1, 127, 128, 255, 0, 254, 5]);
    const b64 = arrayBufferToBase64(buf.buffer);
    const back = new Uint8Array(base64ToArrayBuffer(b64));
    expect(Array.from(back)).toEqual(Array.from(buf));
  });

  it('artifactsToBundle → bundleToArtifacts رفت‌وبرگشت کامل است', () => {
    const src = makeArtifacts(4096);
    const bundle = artifactsToBundle(src, {
      featureVersion: 'v4.2-otsu-scalp-mask',
      metadata: { featureMeans: [1, 2], epochs: 12 },
    });
    expect(isValidModelBundle(bundle)).toBe(true);
    expect(bundle.featureVersion).toBe('v4.2-otsu-scalp-mask');
    expect(bundle.metadata).toEqual({ featureMeans: [1, 2], epochs: 12 });
    expect(bundle.exportedAt).toBeTruthy();

    const back = bundleToArtifacts(bundle);
    expect(back.modelTopology).toEqual(src.modelTopology);
    expect(back.weightSpecs).toEqual(src.weightSpecs);
    expect(Array.from(new Uint8Array(back.weightData))).toEqual(Array.from(new Uint8Array(src.weightData)));
  });

  it('bundleWeightBytes طول واقعی بایت‌ها را برمی‌گرداند', () => {
    const bundle = artifactsToBundle(makeArtifacts(300));
    expect(bundleWeightBytes(bundle)).toBe(300);
  });

  it('ساختارهای نامعتبر رد می‌شوند', () => {
    expect(isValidModelBundle(null)).toBe(false);
    expect(isValidModelBundle({})).toBe(false);
    expect(isValidModelBundle({ modelTopology: null, weightSpecs: [], weightDataBase64: 'AA==' })).toBe(false);
    expect(isValidModelBundle({ modelTopology: {}, weightSpecs: 'no', weightDataBase64: 'AA==' })).toBe(false);
    expect(isValidModelBundle({ modelTopology: {}, weightSpecs: [], weightDataBase64: 42 })).toBe(false);
  });

  it('بستهٔ بیش از سقف اندازه رد می‌شود (دفاع در برابر پیلود غول)', () => {
    const giant: LocalModelBackupBundle = {
      modelTopology: {},
      weightSpecs: [],
      weightDataBase64: 'A'.repeat(Math.floor((MAX_MODEL_WEIGHT_BYTES + 1024) * 4 / 3)),
    };
    expect(isValidModelBundle(giant)).toBe(false);
  });

  it('bundleToArtifacts روی بستهٔ نامعتبر خطا می‌اندازد', () => {
    expect(() => bundleToArtifacts({ modelTopology: null, weightSpecs: [], weightDataBase64: '' } as never)).toThrow();
  });
});

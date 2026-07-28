/**
 * mediaThumbnail.ts — تولید thumbnail کوچک از عکس یا ویدیو هنگام آپلود
 * -----------------------------------------------------------------------
 * لیست‌های گالری به‌جای محتوای کامل (که ممکن است چند مگابایت باشد) فقط همین
 * thumbnail را نمایش می‌دهند؛ محتوای کامل فقط هنگام پیش‌نمایش/تحلیل/دانلود
 * به‌صورت on-demand خوانده می‌شود (resolveGalleryItemUrl در src/db).
 */

const THUMB_MAX_DIMENSION = 320;
const THUMB_JPEG_QUALITY = 0.72;
const VIDEO_THUMB_TIMEOUT_MS = 8000;

function drawToThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number
): string | undefined {
  if (!width || !height) return undefined;
  const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/jpeg', THUMB_JPEG_QUALITY);
  } catch {
    return undefined;
  }
}

function photoThumbnail(dataUrl: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(drawToThumbnail(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

/** گرفتن یک فریم از ابتدای ویدیو به‌عنوان thumbnail */
function videoThumbnail(dataUrl: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    let settled = false;
    const finish = (result: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    // اگر مرورگر نتواند فرمت را decode کند، بدون thumbnail ادامه می‌دهیم
    const timer = setTimeout(() => finish(undefined), VIDEO_THUMB_TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      // کمی جلوتر از فریم صفر تا از فریم‌های سیاه ابتدای ویدیو رد شویم
      try {
        video.currentTime = Math.min(0.1, video.duration || 0);
      } catch {
        finish(drawToThumbnail(video, video.videoWidth, video.videoHeight));
      }
    };
    video.onseeked = () => finish(drawToThumbnail(video, video.videoWidth, video.videoHeight));
    video.onerror = () => finish(undefined);
    video.src = dataUrl;
  });
}

/**
 * تولید thumbnail از data URL. در صورت خطا undefined برمی‌گردد
 * (آیتم بدون thumbnail ذخیره می‌شود — UI یک placeholder نشان می‌دهد).
 */
export function generateMediaThumbnail(
  dataUrl: string,
  type: 'photo' | 'video'
): Promise<string | undefined> {
  return type === 'video' ? videoThumbnail(dataUrl) : photoThumbnail(dataUrl);
}

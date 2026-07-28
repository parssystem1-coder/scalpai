/**
 * رسم و تولید کادر مربعی دور ضایعات روی تصویر تحلیل.
 */

import { lesionDisplayLabel } from './diagnosisCatalog';

export type LesionBox = {
  type: string;
  confidence: number;
  bbox: number[]; // [x1, y1, x2, y2] در پیکسل تصویر
};

export const LESION_BOX_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'] as const;

export type OverlayLesionOptions = {
  lineWidth?: number;
  font?: string;
  /** زبان برچسب روی کادر — پیش‌فرض فارسی */
  lang?: 'fa' | 'en';
};

/** نرمال‌سازی bbox — پشتیبانی از مختصات نرمال ۰–۱ و ترتیب‌های مختلف */
export function normalizeBBox(
  bbox: number[],
  imageWidth: number,
  imageHeight: number,
): [number, number, number, number] | null {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  let [a, b, c, d] = bbox.map(Number);
  if ([a, b, c, d].some(v => Number.isNaN(v))) return null;

  // اگر مقادیر در بازه ۰–۱ هستند → به پیکسل تبدیل کن
  const looksNormalized = [a, b, c, d].every(v => v >= 0 && v <= 1.05);
  if (looksNormalized) {
    a *= imageWidth;
    b *= imageHeight;
    c *= imageWidth;
    d *= imageHeight;
  }

  let x1 = Math.min(a, c);
  let y1 = Math.min(b, d);
  let x2 = Math.max(a, c);
  let y2 = Math.max(b, d);

  // اگر عرض/ارتفاع صفر بود، یک مربع پیش‌فرض بساز
  if (x2 - x1 < 8) {
    const cx = (x1 + x2) / 2;
    const size = Math.max(imageWidth, imageHeight) * 0.18;
    x1 = cx - size / 2;
    x2 = cx + size / 2;
  }
  if (y2 - y1 < 8) {
    const cy = (y1 + y2) / 2;
    const size = Math.max(imageWidth, imageHeight) * 0.18;
    y1 = cy - size / 2;
    y2 = cy + size / 2;
  }

  x1 = Math.max(0, Math.min(imageWidth - 1, x1));
  y1 = Math.max(0, Math.min(imageHeight - 1, y1));
  x2 = Math.max(x1 + 4, Math.min(imageWidth, x2));
  y2 = Math.max(y1 + 4, Math.min(imageHeight, y2));

  return [x1, y1, x2, y2];
}

/** تبدیل bbox مستطیلی به مربع حول مرکز (طبق درخواست کاربر) */
export function toSquareBBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  imageWidth: number,
  imageHeight: number,
): [number, number, number, number] {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  let side = Math.max(x2 - x1, y2 - y1);
  // کادرهای تنگ‌تر تا نواحی کوچک بهتر دیده شوند (نه مربع‌های بزرگ مصنوعی)
  const minSide = Math.min(imageWidth, imageHeight) * 0.05;
  const maxSide = Math.min(imageWidth, imageHeight) * 0.4;
  side = Math.max(minSide, Math.min(maxSide, side));

  let nx1 = cx - side / 2;
  let ny1 = cy - side / 2;
  let nx2 = cx + side / 2;
  let ny2 = cy + side / 2;

  if (nx1 < 0) { nx2 -= nx1; nx1 = 0; }
  if (ny1 < 0) { ny2 -= ny1; ny1 = 0; }
  if (nx2 > imageWidth) { nx1 -= nx2 - imageWidth; nx2 = imageWidth; }
  if (ny2 > imageHeight) { ny1 -= ny2 - imageHeight; ny2 = imageHeight; }

  return [
    Math.max(0, nx1),
    Math.max(0, ny1),
    Math.min(imageWidth, nx2),
    Math.min(imageHeight, ny2),
  ];
}

export function overlayLesionBoxes(
  canvas: HTMLCanvasElement,
  lesions: LesionBox[],
  options?: OverlayLesionOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const lang = options?.lang ?? 'fa';
  const lineWidth = options?.lineWidth ?? Math.max(3, Math.round(Math.min(width, height) / 180));
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 40));
  const font = options?.font ?? `bold ${fontSize}px Vazirmatn, Tahoma, sans-serif`;
  const imageArea = width * height;

  lesions.forEach((lesion, idx) => {
    const normalized = normalizeBBox(lesion.bbox, width, height);
    if (!normalized) return;
    const [x1, y1, x2, y2] = toSquareBBox(...normalized, width, height);
    const w = x2 - x1;
    const h = y2 - y1;
    // کادرهای تقریباً تمام‌صفحه معمولاً اشتباه مدل‌اند — رد کن
    if ((w * h) / imageArea > 0.72) return;

    const color = LESION_BOX_COLORS[idx % LESION_BOX_COLORS.length];
    const displayName = lesionDisplayLabel(lesion.type, lang);

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x1, y1, w, h);

    const corner = Math.min(w, h) * 0.18;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 + corner, y1);
    ctx.moveTo(x2 - corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + corner);
    ctx.moveTo(x2, y2 - corner); ctx.lineTo(x2, y2); ctx.lineTo(x2 - corner, y2);
    ctx.moveTo(x1 + corner, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - corner);
    ctx.stroke();

    const label = `${displayName} (${Math.round(lesion.confidence * 100)}%)`;
    ctx.font = font;
    const textW = ctx.measureText(label).width;
    const padX = 8;
    const padY = 6;
    const labelH = fontSize + padY * 2;
    const labelY = y1 > labelH + 4 ? y1 - 4 : y1 + labelH + 4;
    const boxY = labelY - labelH;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x1, boxY, textW + padX * 2, labelH);
    ctx.fillStyle = color;
    ctx.fillText(label, x1 + padX, boxY + labelH - padY);
  });
}

export function drawLesionBoxesOnCanvas(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  lesions: LesionBox[],
  options?: OverlayLesionOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = canvas.width;
  let height = canvas.height;
  if ('naturalWidth' in image && (image as HTMLImageElement).naturalWidth) {
    width = (image as HTMLImageElement).naturalWidth;
    height = (image as HTMLImageElement).naturalHeight;
  } else if ('width' in image && typeof (image as HTMLCanvasElement).width === 'number') {
    width = (image as HTMLCanvasElement).width;
    height = (image as HTMLCanvasElement).height;
  }

  // اگر منبع همان canvas مقصد است، اول کپی بگیر
  let source: CanvasImageSource = image;
  if (image === canvas) {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    source = copy;
    width = canvas.width;
    height = canvas.height;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(source, 0, 0, width, height);
  overlayLesionBoxes(canvas, lesions, options);
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function renderLesionsToCanvas(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  lesions: LesionBox[],
  options?: OverlayLesionOptions,
): Promise<void> {
  const img = await loadImageElement(imageUrl);
  drawLesionBoxesOnCanvas(canvas, img, lesions, options);
}

/**
 * یافتن نواحی داغ در تصویر برای ساخت کادر مربعی معنادار در تحلیل آفلاین.
 * شبکهٔ سلول‌ها را امتیاز می‌دهد و قوی‌ترین سلول‌ها را برمی‌گرداند.
 */
export function findHotspotSquares(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: 'flake' | 'red' | 'darkGap' | 'pigment',
  maxBoxes = 4,
): [number, number, number, number][] {
  const grid = 8;
  const cellW = width / grid;
  const cellH = height / grid;
  const scores: { gx: number; gy: number; score: number }[] = [];

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let score = 0;
      let samples = 0;
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const x1 = Math.floor((gx + 1) * cellW);
      const y1 = Math.floor((gy + 1) * cellH);

      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          samples++;

          if (mode === 'flake') {
            if (brightness > 200 && r > 180 && g > 180 && b > 180) score++;
          } else if (mode === 'red') {
            if (r > g + 25 && r > b + 25 && r > 100) score++;
          } else if (mode === 'darkGap') {
            // سلول‌های روشن‌تر با پوشش مو کمتر (فاصله بین تارها)
            if (brightness > 90 && brightness < 200) score++;
            if (brightness < 50) score -= 0.5;
          } else if (mode === 'pigment') {
            const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
            if (maxDiff > 35 && brightness > 40 && brightness < 180) score++;
          }
        }
      }

      scores.push({ gx, gy, score: samples ? score / samples : 0 });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const picked = scores.filter(s => s.score > 0).slice(0, maxBoxes);
  // بدون hotspot واقعی کادر نکش — مربع مرکزی «یافتهٔ جعلی» می‌ساخت
  if (picked.length === 0) return [];

  return picked.map(({ gx, gy }) => {
    const pad = 0.15;
    const x1 = (gx + pad) * cellW;
    const y1 = (gy + pad) * cellH;
    const x2 = (gx + 1 - pad) * cellW;
    const y2 = (gy + 1 - pad) * cellH;
    return toSquareBBox(x1, y1, x2, y2, width, height);
  });
}

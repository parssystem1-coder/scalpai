/** گرفتن تصویر PNG روشن از نمودارها — مناسب چاپ رنگی و تک‌رنگ */

export type PrintChartId = 'score' | 'radar' | 'lesions' | 'bars' | 'trend';

export interface CapturedChart {
  id: PrintChartId;
  title: string;
  dataUrl: string;
}

function ensureSvgSize(svg: SVGSVGElement, fallbackW: number, fallbackH: number) {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(rect.width || 0, Number(svg.viewBox.baseVal?.width) || 0, fallbackW);
  const h = Math.max(rect.height || 0, Number(svg.viewBox.baseVal?.height) || 0, fallbackH);
  svg.setAttribute('width', String(Math.round(w)));
  svg.setAttribute('height', String(Math.round(h)));
  if (!svg.getAttribute('viewBox') && w && h) {
    svg.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
}

/** متن و خطوط راهنما را برای پس‌زمینهٔ سفید خوانا می‌کند */
function restyleForLightPrint(source: SVGSVGElement, clone: SVGSVGElement) {
  const srcTexts = source.querySelectorAll('text, tspan');
  const dstTexts = clone.querySelectorAll('text, tspan');
  srcTexts.forEach((_el, i) => {
    const dst = dstTexts[i] as SVGElement | undefined;
    if (!dst) return;
    const cs = window.getComputedStyle(_el);
    dst.setAttribute('fill', '#1f2937');
    dst.setAttribute('font-size', cs.fontSize || '11px');
    dst.setAttribute('font-family', 'Tahoma, "Segoe UI", sans-serif');
    dst.setAttribute('font-weight', cs.fontWeight || '600');
    dst.setAttribute('opacity', '1');
  });

  clone.querySelectorAll('line, polyline, path.recharts-cartesian-axis-line').forEach(el => {
    const s = el as SVGElement;
    const stroke = s.getAttribute('stroke') || '';
    if (!stroke || stroke === 'none') return;
    // خطوط شبکه/محور کم‌رنگ تیره شوند
    if (stroke.includes('rgb(51') || stroke === '#333' || stroke === '#888' || stroke.includes('255')) {
      s.setAttribute('stroke', '#9ca3af');
    }
  });
}

function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    ensureSvgSize(clone, 640, 320);
    restyleForLightPrint(svg, clone);

    // پس‌زمینهٔ سفید داخل خود SVG
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = Math.max(1, img.naturalWidth * scale);
        canvas.height = Math.max(1, img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('canvas'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg image load failed'));
    };
    img.src = url;
  });
}

/**
 * نمودارهای data-print-chart را با پس‌زمینهٔ سفید می‌گیرد (چاپ / PDF).
 * امتیاز سلامت جداگانه با نوار HTML ساخته می‌شود و اینجا skip می‌شود.
 */
export async function capturePrintCharts(): Promise<CapturedChart[]> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-print-chart]'),
  );
  const out: CapturedChart[] = [];

  for (const node of nodes) {
    const id = node.getAttribute('data-print-chart') as PrintChartId | null;
    if (!id || id === 'score' || id === 'trend') continue;
    const title =
      node.getAttribute('data-print-title') ||
      node.querySelector('h3, h4')?.textContent?.trim() ||
      id;
    const svg = node.querySelector('svg');
    if (!svg) continue;
    try {
      const dataUrl = await svgToPngDataUrl(svg as SVGSVGElement);
      out.push({ id, title, dataUrl });
    } catch (e) {
      console.warn('Chart capture failed:', id, e);
    }
  }

  return out;
}

/** نام فایل PDF بر اساس نام مشتری */
export function buildClientPdfFileName(clientName: string): string {
  const cleaned = clientName
    .trim()
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && !'<>:"/\\|?*'.includes(char);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);
  return `${cleaned || 'report'}.pdf`;
}

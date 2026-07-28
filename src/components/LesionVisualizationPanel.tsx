import { useEffect, useRef, useState } from 'react';
import { Eye, ZoomIn, ZoomOut, Download } from 'lucide-react';
import {
  LESION_BOX_COLORS,
  renderLesionsToCanvas,
  type LesionBox,
} from '../lib/lesionVisualization';
import { lesionDisplayLabel } from '../lib/diagnosisCatalog';
import { useLang } from '../i18n';

interface Props {
  imageUrl: string | null | undefined;
  lesions: LesionBox[];
  zoom: number;
  onZoom: (updater: (z: number) => number) => void;
  onDownload: () => void;
  emptyTitle: string;
  emptyHint: string;
  downloadLabel: string;
  legendTitle: string;
  noLesionsLabel: string;
  accent?: 'blue' | 'emerald';
  /** اگر false باشد فقط تصویر نشان داده می‌شود (مثلاً وقتی تصویر قبلاً حاشیه‌نویسی شده) */
  drawBoxes?: boolean;
}

/**
 * تب تصویرسازی مشترک — تصویر بزرگ + کادر مربعی دور ضایعات.
 * خودش canvas را مدیریت می‌کند تا با تعویض تب خالی نماند.
 */
export default function LesionVisualizationPanel({
  imageUrl,
  lesions,
  zoom,
  onZoom,
  onDownload,
  emptyTitle,
  emptyHint,
  downloadLabel,
  legendTitle,
  noLesionsLabel,
  accent = 'emerald',
  drawBoxes = true,
}: Props) {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState('');
  const accentBtn = accent === 'blue' ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30';

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!imageUrl || !canvasRef.current) return;
      setDrawing(true);
      setDrawError('');
      try {
        await renderLesionsToCanvas(canvasRef.current, imageUrl, drawBoxes ? lesions : [], { lang });
      } catch {
        if (!cancelled) setDrawError(emptyHint);
      } finally {
        if (!cancelled) setDrawing(false);
      }
    }
    draw();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, JSON.stringify(lesions), emptyHint, drawBoxes, lang]);

  if (!imageUrl) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 min-h-[560px] flex items-center justify-center">
        <div className="text-center opacity-50">
          <Eye size={64} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">{emptyTitle}</p>
          <p className="text-sm mt-2 opacity-70">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onZoom(z => Math.max(0.5, z - 0.25))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-sm opacity-70 min-w-[3.5rem] text-center">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => onZoom(z => Math.min(3, z + 0.25))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              <ZoomIn size={18} />
            </button>
            {drawing && <span className="text-xs opacity-50">{emptyHint}</span>}
          </div>
          <button
            type="button"
            onClick={onDownload}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${accentBtn}`}
          >
            <Download size={18} />
            <span>{downloadLabel}</span>
          </button>
        </div>

        <div
          className="flex items-center justify-center overflow-auto rounded-xl bg-black/20 border border-white/5"
          style={{ minHeight: '65vh', maxHeight: '78vh' }}
        >
          <canvas
            ref={canvasRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="max-w-full rounded-xl transition-transform"
          />
        </div>
        {drawError && <p className="text-sm text-red-400 mt-3">{drawError}</p>}
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:p-6">
        <h3 className="font-semibold mb-3">{legendTitle}</h3>
        {lesions.length === 0 ? (
          <p className="text-sm opacity-60">{noLesionsLabel}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {lesions.map((lesion, idx) => (
              <div
                key={`${lesion.type}-${idx}`}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/5 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: LESION_BOX_COLORS[idx % LESION_BOX_COLORS.length] }}
                  />
                  <span className="truncate">{lesionDisplayLabel(lesion.type, lang)}</span>
                </div>
                <span className="opacity-70 flex-shrink-0">{Math.round(lesion.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

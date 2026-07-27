import { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Trash2, X } from 'lucide-react';
import {
  observationGroups,
  observationGroupLabel,
  observationsInGroup,
  observationLabel,
  type ObservationId,
} from '../../lib/diagnosisCatalog';
import { LESION_BOX_COLORS } from '../../lib/lesionVisualization';
import { useLang } from '../../i18n';

export type ExpertLesion = {
  type: string;
  confidence: number;
  bbox: number[]; // [x1,y1,x2,y2] در مختصات تصویر اصلی
};

interface Props {
  imageUrl: string;
  lesions: ExpertLesion[];
  onChange: (lesions: ExpertLesion[]) => void;
  clickToEnlargeHint: string;
  drawHint: string;
  pickLabelTitle: string;
  cancelLabel: string;
  removeLabel: string;
  drawnBoxesTitle: string;
  noBoxesLabel: string;
}

type DragState = {
  startX: number;
  startY: number;
  currX: number;
  currY: number;
} | null;

/**
 * تصویر کوچک قابل کلیک → نمای بزرگ؛
 * در نمای بزرگ با درگ موس کادر مستطیلی دور ضایعه و سپس انتخاب برچسب.
 */
export default function ExpertLesionAnnotator({
  imageUrl,
  lesions,
  onChange,
  clickToEnlargeHint,
  drawHint,
  pickLabelTitle,
  cancelLabel,
  removeLabel,
  drawnBoxesTitle,
  noBoxesLabel,
}: Props) {
  const { lang } = useLang();
  const [enlarged, setEnlarged] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<DragState>(null);
  const [pendingBox, setPendingBox] = useState<[number, number, number, number] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize.w) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      lesions.forEach((lesion, idx) => {
        const [x1, y1, x2, y2] = lesion.bbox;
        const color = LESION_BOX_COLORS[idx % LESION_BOX_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 200));
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const label = observationLabel(lesion.type, lang) ?? lesion.type;
        ctx.font = `bold ${Math.max(14, Math.round(canvas.width / 45))}px Vazirmatn, Tahoma, sans-serif`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x1, Math.max(0, y1 - 22), tw + 10, 22);
        ctx.fillStyle = color;
        ctx.fillText(label, x1 + 5, Math.max(16, y1 - 6));
      });

      if (drag) {
        const x = Math.min(drag.startX, drag.currX);
        const y = Math.min(drag.startY, drag.currY);
        const w = Math.abs(drag.currX - drag.startX);
        const h = Math.abs(drag.currY - drag.startY);
        ctx.strokeStyle = '#22d3ee';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    };
    img.src = imageUrl;
  }, [imageUrl, lesions, drag, naturalSize.w, lang]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (enlarged) redraw();
  }, [enlarged, redraw]);

  const clientToImage = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize.w) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = naturalSize.w / rect.width;
    const scaleY = naturalSize.h / rect.height;
    return {
      x: Math.max(0, Math.min(naturalSize.w, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(naturalSize.h, (clientY - rect.top) * scaleY)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pendingBox) return;
    const pt = clientToImage(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ startX: pt.x, startY: pt.y, currX: pt.x, currY: pt.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const pt = clientToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrag({ ...drag, currX: pt.x, currY: pt.y });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const x1 = Math.min(drag.startX, drag.currX);
    const y1 = Math.min(drag.startY, drag.currY);
    const x2 = Math.max(drag.startX, drag.currX);
    const y2 = Math.max(drag.startY, drag.currY);
    setDrag(null);
    if (x2 - x1 < 8 || y2 - y1 < 8) return;
    setPendingBox([x1, y1, x2, y2]);
  };

  const confirmLabel = (id: ObservationId) => {
    if (!pendingBox) return;
    onChange([
      ...lesions,
      { type: id, confidence: 1, bbox: [...pendingBox] },
    ]);
    setPendingBox(null);
  };

  const removeAt = (index: number) => {
    onChange(lesions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        className="relative group block w-full md:w-48"
        title={clickToEnlargeHint}
      >
        <img
          src={imageUrl}
          alt=""
          className="w-full md:w-48 h-48 object-cover rounded-xl border border-white/10 group-hover:border-emerald-400/60 transition"
        />
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition text-sm">
          <Expand size={18} className="me-1" />
          {clickToEnlargeHint}
        </span>
        {lesions.length > 0 && (
          <span className="absolute top-2 end-2 px-2 py-0.5 rounded-lg bg-emerald-600 text-xs">
            {lesions.length}
          </span>
        )}
      </button>

      <div>
        <h4 className="text-sm font-medium mb-2">{drawnBoxesTitle}</h4>
        {lesions.length === 0 ? (
          <p className="text-xs opacity-50">{noBoxesLabel}</p>
        ) : (
          <ul className="space-y-1">
            {lesions.map((lesion, idx) => (
              <li
                key={`${lesion.type}-${idx}`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/5 text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: LESION_BOX_COLORS[idx % LESION_BOX_COLORS.length] }}
                  />
                  <span className="truncate">{observationLabel(lesion.type, lang) ?? lesion.type}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="p-1 rounded hover:bg-red-500/20 text-red-300"
                  title={removeLabel}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {enlarged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            ref={containerRef}
            className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0f172a] border border-white/10 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <p className="text-sm opacity-80">{drawHint}</p>
              <button
                type="button"
                onClick={() => { setEnlarged(false); setDrag(null); setPendingBox(null); }}
                className="p-2 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-3 bg-black/30">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[70vh] cursor-crosshair touch-none rounded-lg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
              />
            </div>

            {pendingBox && (
              <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-lg rounded-2xl bg-[#111827] border border-white/15 p-4 shadow-xl">
                  <h4 className="font-semibold mb-3">{pickLabelTitle}</h4>
                  <div className="space-y-3 max-h-72 overflow-auto mb-3 pe-1">
                    {observationGroups.map(group => (
                      <div key={group.id}>
                        <p className="text-[11px] opacity-50 mb-1.5">
                          {observationGroupLabel(group.id, lang)}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {observationsInGroup(group.id).map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => confirmLabel(opt.id)}
                              className="p-2 rounded-xl text-xs bg-white/5 hover:bg-emerald-500 hover:text-white transition text-center"
                            >
                              {observationLabel(opt.id, lang)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingBox(null)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm"
                  >
                    {cancelLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

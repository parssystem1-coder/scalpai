import { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';
import type { GalleryItem } from '../../db';
import { resolveGalleryItemUrl } from '../../db';
import { useLang, useT } from '../../i18n';
import type { Dict } from '../../i18n';

const dict = {
  download: { fa: 'دانلود', en: 'Download' },
  reset: { fa: 'بازنشانی', en: 'Reset' },
  panHint: { fa: 'برای جابجایی، عکس را بگیرید و بکشید', en: 'Click and drag to pan' },
} satisfies Dict;

interface Props {
  image: GalleryItem;
  /** محتوای کامل (اگر resolve شده) — تا آن موقع thumbnail نمایش داده می‌شود */
  caption?: string;
  onClose: () => void;
}

/** لایت‌باکس تصویر با zoom/pan/rotate و دانلود محتوای کامل */
export default function ImageLightbox({ image, caption, onClose }: Props) {
  const t = useT(dict);
  const { isRtl } = useLang();

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    if (newZoom <= 1) setOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const downloadImage = async () => {
    const url = await resolveGalleryItemUrl(image);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = image.filename || `image-${image.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col z-50" onClick={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-black/50" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={() => handleZoomChange(Math.max(0.25, zoom - 0.25))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <ZoomOut size={20} />
          </button>
          <span className="text-sm opacity-70 w-16 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => handleZoomChange(Math.min(4, zoom + 0.25))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <ZoomIn size={20} />
          </button>
          <button onClick={() => { setRotation(r => r + 90); setOffset({ x: 0, y: 0 }); }} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <RotateCw size={20} />
          </button>
          {(offset.x !== 0 || offset.y !== 0) && (
            <button onClick={() => setOffset({ x: 0, y: 0 })} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs">
              {t('reset')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadImage} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30">
            <Download size={18} />
            <span>{t('download')}</span>
          </button>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image with drag support */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden p-4"
        onClick={e => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={image.url}
          alt=""
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.2s',
            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Info */}
      <div className="p-4 bg-black/50 text-center" onClick={e => e.stopPropagation()}>
        <p className="font-medium">{image.filename}</p>
        {caption && (
          <p className="text-sm opacity-50">
            {caption} - {new Date(image.createdAt).toLocaleDateString(isRtl ? 'fa-IR' : 'en-US')}
          </p>
        )}
        {zoom > 1 && <p className="text-xs text-blue-400 mt-1">{t('panHint')}</p>}
      </div>
    </div>
  );
}

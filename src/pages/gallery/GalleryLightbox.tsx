import { X, ZoomIn, ZoomOut, Download, RotateCw, Loader } from 'lucide-react';
import type { Client, GalleryItem } from '../../db';
import { scalpRegionLabel, readScalpRegionFromMetadata } from '../../lib/scalpRegions';
import {
  getTrichoscopeMode,
  readTrichoscopeModeFromMetadata,
} from '../../lib/trichoscopeModes';
import { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ROTATE_STEP_DEG } from './constants';

type GalleryLightboxProps = {
  previewItem: GalleryItem;
  previewUrl: string | null;
  zoom: number;
  rotation: number;
  /** kept for API compatibility — labels are always English */
  isRtl: boolean;
  getClient: (id: string) => Client | undefined;
  onClose: () => void;
  onZoomChange: (updater: (z: number) => number) => void;
  onRotationChange: (updater: (r: number) => number) => void;
  onDownload: (item: GalleryItem) => void;
};

export function GalleryLightbox({
  previewItem,
  previewUrl,
  zoom,
  rotation,
  getClient,
  onClose,
  onZoomChange,
  onRotationChange,
  onDownload,
}: GalleryLightboxProps) {
  const regionId = readScalpRegionFromMetadata(previewItem.metadata);
  const lensMode = getTrichoscopeMode(readTrichoscopeModeFromMetadata(previewItem.metadata));

  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col z-50" onClick={onClose}>
      <div className="flex items-center justify-between p-4 bg-black/50" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={() => onZoomChange(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <ZoomOut size={20} />
          </button>
          <span className="text-sm opacity-70 w-16 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => onZoomChange(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <ZoomIn size={20} />
          </button>
          <button onClick={() => onRotationChange(r => r + ROTATE_STEP_DEG)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <RotateCw size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onDownload(previewItem)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30">
            <Download size={18} />
            <span>Download</span>
          </button>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-auto p-4" onClick={e => e.stopPropagation()}>
        {!previewUrl ? (
          <div className="flex items-center gap-2 opacity-50">
            <Loader className="animate-spin" size={24} />
            <span>Loading...</span>
          </div>
        ) : previewItem.type === 'photo' ? (
          <img
            src={previewUrl}
            alt=""
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
            className="max-w-full max-h-full object-contain cursor-move"
            draggable={false}
          />
        ) : (
          <video src={previewUrl} controls autoPlay className="max-w-full max-h-full" />
        )}
      </div>
      <div className="p-4 bg-black/50 text-center" onClick={e => e.stopPropagation()}>
        <p className="font-medium">{previewItem.filename}</p>
        <p className="text-sm opacity-50">
          {getClient(previewItem.clientId)?.firstName} {getClient(previewItem.clientId)?.lastName} -{' '}
          {new Date(previewItem.createdAt).toLocaleDateString('en-US')}
        </p>
        {regionId && (
          <p className="text-sm text-cyan-300/90 mt-1">{scalpRegionLabel(regionId, 'en')}</p>
        )}
        {lensMode && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/80">
            <span
              className="w-3 h-3 rounded-[3px] border border-white/20"
              style={{ background: lensMode.color }}
            />
            {lensMode.en}
          </p>
        )}
      </div>
    </div>
  );
}

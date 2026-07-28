import type { Dispatch, SetStateAction } from 'react';
import type { AIAnalysisResult, GalleryItem } from '../../db';
import LesionVisualizationPanel from '../../components/LesionVisualizationPanel';
import { usePick, useT } from '../../i18n';
import { aiAnalysisDict } from './strings';

export type SessionPhotoView = {
  analysisId: string;
  imageUrl: string;
  lesions: { type: string; confidence: number; bbox: number[] }[];
  label: string;
  /** اگر true باشد کادر دوباره رسم نمی‌شود (تصویر از قبل حاشیه‌نویسی شده) */
  hasAnnotated?: boolean;
};

interface Props {
  result: AIAnalysisResult | null;
  selectedImage: GalleryItem | null;
  sessionPhotos: SessionPhotoView[];
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  downloadResult: () => void;
}

export default function VisualizationTab({
  result,
  selectedImage,
  sessionPhotos,
  zoom,
  setZoom,
  downloadResult,
}: Props) {
  const t = useT(aiAnalysisDict);
  const pick = usePick();

  const photos =
    sessionPhotos.length > 0
      ? sessionPhotos
      : result || selectedImage
        ? [{
            analysisId: 'current',
            imageUrl: result?.annotatedImageBase64 || selectedImage?.url || '',
            lesions: result?.lesions ?? [],
            label: pick('عکس ۱', 'Photo 1'),
            hasAnnotated: Boolean(result?.annotatedImageBase64),
          }]
        : [];

  if (photos.length === 0 || !photos[0].imageUrl) {
    return (
      <LesionVisualizationPanel
        imageUrl={null}
        lesions={[]}
        zoom={zoom}
        onZoom={setZoom}
        onDownload={downloadResult}
        emptyTitle={t('performAnalysisFirst')}
        emptyHint={t('visualizationHint')}
        downloadLabel={t('downloadImage')}
        legendTitle={t('detectedLesions')}
        noLesionsLabel={t('noLesions')}
        accent="blue"
      />
    );
  }

  return (
    <div className="space-y-8">
      {photos.length > 1 && (
        <p className="text-sm opacity-70">
          {pick(
            `${photos.length} عکس در این جلسه — معضلات هر عکس جداگانه مشخص شده‌اند`,
            `${photos.length} photos in this visit — findings shown per photo`,
          )}
        </p>
      )}
      {photos.map((photo, idx) => (
        <div key={photo.analysisId} className="space-y-2">
          <h3 className="font-medium text-sm opacity-80">
            {photo.label || pick(`عکس ${idx + 1}`, `Photo ${idx + 1}`)}
          </h3>
          <LesionVisualizationPanel
            imageUrl={photo.imageUrl}
            lesions={photo.lesions}
            drawBoxes={!photo.hasAnnotated}
            zoom={zoom}
            onZoom={setZoom}
            onDownload={downloadResult}
            emptyTitle={t('performAnalysisFirst')}
            emptyHint={t('visualizationHint')}
            downloadLabel={t('downloadImage')}
            legendTitle={t('detectedLesions')}
            noLesionsLabel={t('noLesions')}
            accent="blue"
          />
        </div>
      ))}
    </div>
  );
}

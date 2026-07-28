import type { GalleryItem, OfflineAnalysisResult } from '../../db';
import LesionVisualizationPanel from '../../components/LesionVisualizationPanel';
import { usePick, useT } from '../../i18n';
import { offlineDict } from './strings';
import type { SessionPhotoView } from '../ai-analysis/VisualizationTab';

interface Props {
  result: OfflineAnalysisResult | null;
  selectedImage: GalleryItem | null;
  sessionPhotos: SessionPhotoView[];
  zoom: number;
  onZoom: React.Dispatch<React.SetStateAction<number>>;
  onDownload: () => void;
}

export default function VisualizationTab({
  result, selectedImage, sessionPhotos, zoom, onZoom, onDownload,
}: Props) {
  const t = useT(offlineDict);
  const pick = usePick();

  const photos =
    sessionPhotos.length > 0
      ? sessionPhotos
      : result || selectedImage
        ? [{
            analysisId: 'current',
            imageUrl: selectedImage?.url || result?.annotatedImageBase64 || '',
            lesions: result?.lesions ?? [],
            label: pick('عکس ۱', 'Photo 1'),
            hasAnnotated: false,
          }]
        : [];

  if (photos.length === 0 || !photos[0].imageUrl) {
    return (
      <LesionVisualizationPanel
        imageUrl={null}
        lesions={[]}
        zoom={zoom}
        onZoom={onZoom}
        onDownload={onDownload}
        emptyTitle={t('performAnalysisFirst')}
        emptyHint={t('visualizationHint')}
        downloadLabel={t('download')}
        legendTitle={t('lesions')}
        noLesionsLabel={t('noLesions')}
        accent="emerald"
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
            onZoom={onZoom}
            onDownload={onDownload}
            emptyTitle={t('performAnalysisFirst')}
            emptyHint={t('visualizationHint')}
            downloadLabel={t('download')}
            legendTitle={t('lesions')}
            noLesionsLabel={t('noLesions')}
            accent="emerald"
          />
        </div>
      ))}
    </div>
  );
}

export {
  ZOOM_STEP,
  ZOOM_MIN,
  ZOOM_MAX,
  ROTATE_STEP_DEG,
} from '../../lib/mediaUiConstants';

export const ALBUM_PAGE_SIZE = 12;
export const RECENT_CLIENTS_LIMIT = 10;
export const CLIENT_SEARCH_LIMIT = 20;
export const ALBUM_PREVIEW_COUNT = 4;

/** حالت نمایش محتوا: دسته‌بندی مشتری یا همه آیتم‌ها */
export type DisplayMode = 'byClient' | 'all';

/** اندازه و چیدمان مشترک عکس‌ها و آلبوم‌ها */
export type GalleryViewMode = 'compact' | 'standard' | 'large' | 'list';

export const GALLERY_VIEW_MODE_KEY = 'scalpai.gallery.viewMode';
export const DEFAULT_GALLERY_VIEW_MODE: GalleryViewMode = 'compact';

const GALLERY_VIEW_MODES: readonly GalleryViewMode[] = ['compact', 'standard', 'large', 'list'];

export function readStoredGalleryViewMode(): GalleryViewMode {
  try {
    const raw = localStorage.getItem(GALLERY_VIEW_MODE_KEY);
    if (raw && (GALLERY_VIEW_MODES as readonly string[]).includes(raw)) {
      return raw as GalleryViewMode;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_GALLERY_VIEW_MODE;
}

export function persistGalleryViewMode(mode: GalleryViewMode): void {
  try {
    localStorage.setItem(GALLERY_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export const GALLERY_DISPLAY_MODE_KEY = 'scalpai.gallery.displayMode';
export const DEFAULT_GALLERY_DISPLAY_MODE: DisplayMode = 'byClient';

const GALLERY_DISPLAY_MODES: readonly DisplayMode[] = ['byClient', 'all'];

export function readStoredGalleryDisplayMode(): DisplayMode {
  try {
    const raw = localStorage.getItem(GALLERY_DISPLAY_MODE_KEY);
    if (raw && (GALLERY_DISPLAY_MODES as readonly string[]).includes(raw)) {
      return raw as DisplayMode;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_GALLERY_DISPLAY_MODE;
}

export function persistGalleryDisplayMode(mode: DisplayMode): void {
  try {
    localStorage.setItem(GALLERY_DISPLAY_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Trichoscope illumination / lens modes stored with each gallery photo. */

export type TrichoscopeModeId = 'NL' | 'PL' | 'UV' | 'IR';

export type TrichoscopeMode = {
  id: TrichoscopeModeId;
  en: string;
  fa: string;
  color: string;
  textColor: string;
  useEn: string;
  useFa: string;
};

export const TRICHOSCOPE_MODE_META_KEY = 'trichoscopeMode';

export const TRICHOSCOPE_MODES: readonly TrichoscopeMode[] = [
  {
    id: 'NL',
    en: 'White Light (NL)',
    fa: 'نور سفید معمولی',
    color: '#f8fafc',
    textColor: '#0f172a',
    useEn: 'Surface structure, scaling and hair density',
    useFa: 'ساختار سطحی، پوسته و تراکم مو',
  },
  {
    id: 'PL',
    en: 'Polarized Light (PL)',
    fa: 'نور پلاریزه (قطبیده)',
    color: '#38bdf8',
    textColor: '#082f49',
    useEn: 'Blood vessels, redness and subcutaneous inflammation',
    useFa: 'رگ‌های خونی، قرمزی و التهاب زیرپوستی',
  },
  {
    id: 'UV',
    en: 'UV Light (UV)',
    fa: 'نور فرابنفش',
    color: '#a855f7',
    textColor: '#ffffff',
    useEn: 'Bacteria, fungi, deep sebum and porphyrins',
    useFa: 'باکتری، قارچ، چربی عمقی و پورفیرین',
  },
  {
    id: 'IR',
    en: 'Infrared Light (IR)',
    fa: 'نور مادون قرمز',
    color: '#ef4444',
    textColor: '#ffffff',
    useEn: 'Deep circulation, moisture and hair roots',
    useFa: 'گردش خون عمقی، رطوبت و ریشه مو',
  },
] as const;

export function getTrichoscopeMode(
  id: string | undefined | null,
): TrichoscopeMode | undefined {
  return TRICHOSCOPE_MODES.find(mode => mode.id === id);
}

export function readTrichoscopeModeFromMetadata(
  metadata: Record<string, unknown> | undefined,
): TrichoscopeModeId | null {
  const value = metadata?.[TRICHOSCOPE_MODE_META_KEY];
  return typeof value === 'string' && getTrichoscopeMode(value)
    ? (value as TrichoscopeModeId)
    : null;
}

export function regionModeKey(regionId: string, modeId: TrichoscopeModeId): string {
  return `${regionId}:${modeId}`;
}

/** کاتالوگ نواحی استاندارد عکس پوست سر / تریکوسکوپی */

export type ScalpRegionId =
  | 'frontal'
  | 'hairline'
  | 'rightTemporal'
  | 'leftTemporal'
  | 'topMidscalp'
  | 'crown'
  | 'occipital'
  | 'rightParietal'
  | 'leftParietal';

export interface ScalpRegion {
  id: ScalpRegionId;
  fa: string;
  en: string;
  /** برچسب کوتاه روی مدل سه‌بعدی (مثل عکس مرجع) */
  shortEn: string;
  hintFa: string;
  hintEn: string;
  color: string;
  /** مرکز ناحیه روی سطح سر */
  position: [number, number, number];
  /**
   * چندضلعی کروی ناحیه — هر نقطه [phi, theta] به رادیان
   * phi: حول Y — ۰=جلو(+Z)، مثبت=راست آناتومیک(+X)، ±π=پشت
   * theta: از قطب بالا — ۰=تاج، π/۲≈استوا
   */
  poly: readonly (readonly [number, number])[];
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * پارتیشن پوست سر مطابق دیاگرام مرجع (۹ ناحیه با مرز مشخص)
 * یک سر واحد؛ با چرخش همه نواحی دیده می‌شوند.
 */
export const SCALP_REGIONS: readonly ScalpRegion[] = [
  {
    id: 'frontal',
    fa: 'فرونتال',
    en: 'Frontal',
    shortEn: 'Frontal',
    hintFa: 'جلوی سر بالای پیشانی؛ خط رویش فرونتال',
    hintEn: 'Front scalp above brow; frontal hairline',
    color: '#3b9eff',
    position: [0, 0.45, 0.9],
    poly: [
      [deg(-32), deg(48)],
      [deg(32), deg(48)],
      [deg(38), deg(68)],
      [deg(0), deg(78)],
      [deg(-38), deg(68)],
    ],
  },
  {
    id: 'hairline',
    fa: 'خط رویش',
    en: 'Hairline',
    shortEn: 'Hairline',
    hintFa: 'نوار مرکزی خط رویش بالای فرونتال',
    hintEn: 'Central hairline band above frontal',
    color: '#3b9eff',
    position: [0, 0.72, 0.62],
    poly: [
      [deg(-26), deg(30)],
      [deg(26), deg(30)],
      [deg(32), deg(48)],
      [deg(-32), deg(48)],
    ],
  },
  {
    id: 'rightTemporal',
    fa: 'شقیقه راست',
    en: 'Right Temporal',
    shortEn: 'Right Temporal',
    hintFa: 'شقیقه و گوشه راست پیشانی',
    hintEn: 'Right temple and frontal corner',
    color: '#3b9eff',
    position: [0.85, 0.35, 0.4],
    poly: [
      [deg(32), deg(48)],
      [deg(26), deg(30)],
      [deg(58), deg(38)],
      [deg(88), deg(52)],
      [deg(78), deg(72)],
      [deg(38), deg(68)],
    ],
  },
  {
    id: 'leftTemporal',
    fa: 'شقیقه چپ',
    en: 'Left Temporal',
    shortEn: 'Left Temporal',
    hintFa: 'شقیقه و گوشه چپ پیشانی',
    hintEn: 'Left temple and frontal corner',
    color: '#3b9eff',
    position: [-0.85, 0.35, 0.4],
    poly: [
      [deg(-32), deg(48)],
      [deg(-38), deg(68)],
      [deg(-78), deg(72)],
      [deg(-88), deg(52)],
      [deg(-58), deg(38)],
      [deg(-26), deg(30)],
    ],
  },
  {
    id: 'topMidscalp',
    fa: 'میانسکالپ',
    en: 'Mid-scalp',
    shortEn: 'Mid-scalp',
    hintFa: 'میانه بالای سر بین خط رویش و ورتکس',
    hintEn: 'Mid top scalp between hairline and vertex',
    color: '#3b9eff',
    position: [0, 0.98, 0.05],
    poly: [
      [deg(-40), deg(12)],
      [deg(40), deg(12)],
      [deg(48), deg(32)],
      [deg(26), deg(30)],
      [deg(-26), deg(30)],
      [deg(-48), deg(32)],
    ],
  },
  {
    id: 'crown',
    fa: 'ورتکس',
    en: 'Vertex',
    shortEn: 'Vertex',
    hintFa: 'تاج / بالاترین نقطه سر',
    hintEn: 'Crown / highest vertex of the scalp',
    color: '#3b9eff',
    position: [0, 1.0, -0.25],
    poly: [
      [deg(-50), deg(5)],
      [deg(50), deg(5)],
      [deg(70), deg(22)],
      [deg(40), deg(12)],
      [deg(-40), deg(12)],
      [deg(-70), deg(22)],
    ],
  },
  {
    id: 'occipital',
    fa: 'اکسیپیتال',
    en: 'Occipital',
    shortEn: 'Occipital',
    hintFa: 'پشت سر / بانک موی اکسیپیتال',
    hintEn: 'Back of head / occipital donor area',
    color: '#3b9eff',
    position: [0, 0.15, -0.95],
    // پشت سر: phi ≈ ±180
    poly: [
      [deg(145), deg(48)],
      [deg(180), deg(42)],
      [deg(-145), deg(48)],
      [deg(-155), deg(72)],
      [deg(180), deg(82)],
      [deg(155), deg(72)],
    ],
  },
  {
    id: 'rightParietal',
    fa: 'پاریتال راست',
    en: 'Right Parietal',
    shortEn: 'Right Parietal',
    hintFa: 'کنار راست بالای سر تا پشت',
    hintEn: 'Right upper side scalp toward back',
    color: '#3b9eff',
    position: [0.85, 0.55, -0.35],
    poly: [
      [deg(40), deg(12)],
      [deg(70), deg(22)],
      [deg(110), deg(38)],
      [deg(145), deg(48)],
      [deg(110), deg(55)],
      [deg(88), deg(52)],
      [deg(58), deg(38)],
      [deg(48), deg(32)],
    ],
  },
  {
    id: 'leftParietal',
    fa: 'پاریتال چپ',
    en: 'Left Parietal',
    shortEn: 'Left Parietal',
    hintFa: 'کنار چپ بالای سر تا پشت',
    hintEn: 'Left upper side scalp toward back',
    color: '#3b9eff',
    position: [-0.85, 0.55, -0.35],
    poly: [
      [deg(-40), deg(12)],
      [deg(-48), deg(32)],
      [deg(-58), deg(38)],
      [deg(-88), deg(52)],
      [deg(-110), deg(55)],
      [deg(-145), deg(48)],
      [deg(-110), deg(38)],
      [deg(-70), deg(22)],
    ],
  },
] as const;

export const SCALP_REGION_IDS: ScalpRegionId[] = SCALP_REGIONS.map(r => r.id);

export function getScalpRegion(id: string | undefined | null): ScalpRegion | undefined {
  if (!id) return undefined;
  return SCALP_REGIONS.find(r => r.id === id);
}

export function scalpRegionLabel(id: string, lang: 'fa' | 'en'): string {
  const r = getScalpRegion(id);
  if (!r) return id;
  return lang === 'fa' ? `${r.fa} (${r.en})` : `${r.en} / ${r.fa}`;
}

export const SCALP_REGION_META_KEY = 'scalpRegion';

export function readScalpRegionFromMetadata(
  metadata: Record<string, unknown> | undefined,
): ScalpRegionId | null {
  const v = metadata?.[SCALP_REGION_META_KEY];
  if (typeof v !== 'string') return null;
  return SCALP_REGION_IDS.includes(v as ScalpRegionId) ? (v as ScalpRegionId) : null;
}

/** نگاشت نقطه کروی به مختصات روی بیضی‌گون سر (هماهنگ با Lathe head) */
export function sphericalToHead(
  phi: number,
  theta: number,
  rx = 0.88,
  ry = 1.12,
  rz = 0.9,
  yOffset = 0.02,
): [number, number, number] {
  const x = rx * Math.sin(theta) * Math.sin(phi);
  const y = ry * Math.cos(theta) + yOffset;
  const z = rz * Math.sin(theta) * Math.cos(phi);
  return [x, y, z];
}

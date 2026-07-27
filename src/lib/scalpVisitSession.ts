/** جلسات آپلود ناحیه‌ای پوست سر — جدا از آرشیو عکس‌های قبلی مشتری */

import type { ScalpRegionId } from './scalpRegions';
import { SCALP_REGION_IDS } from './scalpRegions';
import {
  readTrichoscopeModeFromMetadata,
  regionModeKey,
  type TrichoscopeModeId,
} from './trichoscopeModes';

export const SCALP_VISIT_META_KEY = 'scalpVisitId';

export type ScalpVisitStatus = 'active' | 'paused' | 'ended';

type ClientVisitRecord = {
  visitId: string;
  status: ScalpVisitStatus;
};

const STORAGE_KEY = 'scalpai.scalpRegionVisits.v1';
const LAST_SELECTED_CLIENT_KEY = 'scalpai.scalpRegionVisits.lastClient';

function loadAll(): Record<string, ClientVisitRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ClientVisitRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, ClientVisitRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function setLastSelectedClient(clientId: string): void {
  try { localStorage.setItem(LAST_SELECTED_CLIENT_KEY, clientId); } catch { /* ignore */ }
}

export function getLastSelectedClient(): string | null {
  try { return localStorage.getItem(LAST_SELECTED_CLIENT_KEY); } catch { return null; }
}

export function clearLastSelectedClient(): void {
  try { localStorage.removeItem(LAST_SELECTED_CLIENT_KEY); } catch { /* ignore */ }
}

function newVisitId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** بازدید جاری قابل ادامه (active/paused) یا null اگر پایان یافته / وجود ندارد */
export function getResumableVisit(clientId: string): ClientVisitRecord | null {
  const rec = loadAll()[clientId];
  if (!rec) return null;
  if (rec.status === 'ended') return null;
  return rec;
}

/**
 * هنگام انتخاب مشتری: اگر جلسه paused/active باشد همان را ادامه بده،
 * وگرنه جلسهٔ خالی جدید بساز.
 */
export function ensureActiveVisit(clientId: string): string {
  const all = loadAll();
  const rec = all[clientId];
  if (rec && (rec.status === 'active' || rec.status === 'paused')) {
    if (rec.status === 'paused') {
      all[clientId] = { visitId: rec.visitId, status: 'active' };
      saveAll(all);
    }
    return rec.visitId;
  }
  const visitId = newVisitId();
  all[clientId] = { visitId, status: 'active' };
  saveAll(all);
  return visitId;
}

/** موقتاً پایان — با برگشت مشتری، نواحی همین جلسه باقی می‌مانند */
export function pauseScalpVisit(clientId: string): void {
  const all = loadAll();
  const rec = all[clientId];
  if (!rec || rec.status === 'ended') return;
  all[clientId] = { visitId: rec.visitId, status: 'paused' };
  saveAll(all);
}

/** پایان قطعی — جلسه بسته؛ دفعه بعد همه نواحی خالی برای آپلود جدید */
export function endScalpVisit(clientId: string): void {
  const all = loadAll();
  const rec = all[clientId];
  if (!rec) return;
  all[clientId] = { visitId: rec.visitId, status: 'ended' };
  saveAll(all);
}

export function readScalpVisitFromMetadata(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const v = metadata?.[SCALP_VISIT_META_KEY];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function collectAssignedRegionsForVisit(
  items: { metadata?: Record<string, unknown>; type?: string }[],
  visitId: string,
  readRegion: (m: Record<string, unknown> | undefined) => ScalpRegionId | null,
): Set<ScalpRegionId> {
  const set = new Set<ScalpRegionId>();
  for (const item of items) {
    if (item.type && item.type !== 'photo') continue;
    const vid = readScalpVisitFromMetadata(item.metadata);
    if (vid !== visitId) continue;
    const rid = readRegion(item.metadata);
    if (rid && SCALP_REGION_IDS.includes(rid)) set.add(rid);
  }
  return set;
}

/** تمام ترکیب‌های ناحیه + لنز که در این جلسه عکس دارند. */
export function collectAssignedRegionModesForVisit(
  items: { metadata?: Record<string, unknown>; type?: string }[],
  visitId: string,
  readRegion: (m: Record<string, unknown> | undefined) => ScalpRegionId | null,
): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    if (item.type && item.type !== 'photo') continue;
    if (readScalpVisitFromMetadata(item.metadata) !== visitId) continue;

    const regionId = readRegion(item.metadata);
    // Legacy photos without lens metadata are treated as White Light.
    const modeId =
      readTrichoscopeModeFromMetadata(item.metadata) ?? ('NL' satisfies TrichoscopeModeId);
    if (regionId && SCALP_REGION_IDS.includes(regionId)) {
      set.add(regionModeKey(regionId, modeId));
    }
  }
  return set;
}

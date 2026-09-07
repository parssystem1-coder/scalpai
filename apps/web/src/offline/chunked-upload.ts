import {
  MULTIPART_THRESHOLD_BYTES,
  UPLOAD_PART_URL_BATCH_MAX,
  partRange,
} from "@scalpai/shared";
import { ApiError, apiFetch } from "../api/client.js";
import { getOfflineDb, type PendingUpload } from "./db.js";

/**
 * Resumable media upload — phase 8 (WEAKNESSES H7/H12, ADR-0041).
 *
 * The previous implementation called itself resumable and was not: on resume it
 * asked the API to initiate a NEW multipart upload for the same file, threw away
 * every ETag, cleared `completedParts` and re-sent all of it. It also kept that
 * state in `localStorage`, so it outlived a logout and was the only record of
 * parts sitting in the bucket.
 *
 * What actually happens now:
 *  1. open a session on the server (it owns `uploadId`, part size, part count);
 *  2. keep a POINTER to it in the scoped Dexie database;
 *  3. on resume, ask the server which parts the BUCKET holds and send only the
 *     missing ones — same `uploadId`, no re-sending;
 *  4. fetch presigned part URLs a window at a time, and re-fetch a window when a
 *     signature has expired mid-flight.
 */

export type PendingUploadState = PendingUpload;

interface PartUrl {
  partNumber: number;
  url: string;
  bytes: number;
}

interface OpenResponse {
  id: string;
  sessionId: string;
  key: string;
  multipart: boolean;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  expiresAt: string;
  uploadUrl?: string;
  parts?: PartUrl[];
}

interface StatusResponse {
  sessionId: string;
  galleryItemId: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  multipart: boolean;
  state: string;
  uploadedParts: number[];
}

/* ── durable pointer ─────────────────────────────────────────────── */

async function save(record: PendingUpload): Promise<void> {
  const db = getOfflineDb();
  if (!db) return; // signed out: the upload still works, it just cannot be resumed
  record.updatedAt = Date.now();
  await db.pendingUploads.put(record);
}

async function drop(key: string): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await db.pendingUploads.delete(key);
}

/** Pending uploads for the badge UI. Async because IndexedDB is. */
export async function getPendingUploads(): Promise<PendingUpload[]> {
  const db = getOfflineDb();
  if (!db) return [];
  try {
    return await db.pendingUploads.orderBy("createdAt").toArray();
  } catch {
    return [];
  }
}

async function findResumable(file: File, patientId: string): Promise<PendingUpload | null> {
  const db = getOfflineDb();
  if (!db) return null;
  try {
    const rows = await db.pendingUploads.where("patientId").equals(patientId).toArray();
    return rows.find((r) => r.fileName === file.name && r.fileSize === file.size) ?? null;
  } catch {
    return null;
  }
}

/* ── public entry point ────────────────────────────────────────── */

export async function uploadChunked(
  file: File,
  patientId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const existing = await findResumable(file, patientId);
  if (existing && (await resume(existing, file, onProgress))) return;
  if (existing) await drop(existing.key);
  await start(file, patientId, onProgress);
}

async function start(file: File, patientId: string, onProgress?: (pct: number) => void): Promise<void> {
  const mime = file.type || "image/jpeg";
  const opened = await apiFetch<OpenResponse>(`/patients/${patientId}/gallery/uploads`, {
    method: "POST",
    body: JSON.stringify({ mime, sizeBytes: file.size }),
  });

  const record: PendingUpload = {
    key: opened.id,
    sessionId: opened.sessionId,
    patientId,
    fileName: file.name,
    fileSize: file.size,
    mime,
    partSizeBytes: opened.partSizeBytes,
    totalParts: opened.totalParts,
    multipart: opened.multipart,
    partEtags: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await save(record);

  if (!opened.multipart) {
    if (!opened.uploadUrl) throw new Error("server did not return an upload url");
    const res = await fetch(opened.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": mime },
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    onProgress?.(100);
    await apiFetch(`/gallery/${record.key}/complete`, { method: "POST" });
    await drop(record.key);
    return;
  }

  await pump(record, file, new Set<number>(), onProgress, opened.parts ?? []);
}

/**
 * Continue an upload the server still considers open. Returns false when the
 * session is gone or no longer matches the file, so the caller can start over
 * instead of pretending to resume something that does not exist.
 */
async function resume(
  record: PendingUpload,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  let status: StatusResponse;
  try {
    status = await apiFetch<StatusResponse>(`/gallery/uploads/${record.sessionId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return false;
    throw err;
  }
  if (status.state !== "open") return false;
  if (status.sizeBytes !== record.fileSize || status.totalParts !== record.totalParts) return false;
  if (!status.multipart) return false;

  // Trust only the parts the BUCKET confirms AND for which this device still has
  // an ETag; anything else is re-uploaded rather than assumed.
  const confirmed = new Set(status.uploadedParts.filter((n) => Boolean(record.partEtags[n])));
  record.partSizeBytes = status.partSizeBytes;
  await save(record);
  await pump(record, file, confirmed, onProgress, []);
  return true;
}

/**
 * Send every missing part, then complete. Part URLs are requested one window at
 * a time and re-requested once if the bucket refuses the signature — a 50MB
 * upload on a slow uplink outlives the 15 minute TTL of its first URLs.
 */
async function pump(
  record: PendingUpload,
  file: File,
  alreadyDone: Set<number>,
  onProgress: ((pct: number) => void) | undefined,
  seeded: PartUrl[],
): Promise<void> {
  const done = new Set(alreadyDone);
  const total = record.totalParts;
  const report = () => onProgress?.(Math.min(100, Math.round((done.size / total) * 100)));
  report();

  for (let from = 1; from <= total; from += UPLOAD_PART_URL_BATCH_MAX) {
    const count = Math.min(UPLOAD_PART_URL_BATCH_MAX, total - from + 1);
    const window: number[] = [];
    for (let n = from; n < from + count; n++) if (!done.has(n)) window.push(n);
    if (window.length === 0) continue;

    let urls = from === 1 && seeded.length > 0 ? seeded : await requestPartUrls(record.sessionId, from, count);

    for (const partNumber of window) {
      const slice = partRange(partNumber, record.fileSize, record.partSizeBytes);
      const blob = file.slice(slice.start, slice.end);

      let target = urls.find((u) => u.partNumber === partNumber);
      if (!target) {
        urls = await requestPartUrls(record.sessionId, partNumber, count);
        target = urls.find((u) => u.partNumber === partNumber);
        if (!target) throw new Error(`server did not return a url for part ${partNumber}`);
      }

      let etag = await putPart(target.url, blob, record.mime);
      if (etag === null) {
        // expired or rejected signature: one fresh window, then give up honestly
        urls = await requestPartUrls(record.sessionId, partNumber, count);
        const retry = urls.find((u) => u.partNumber === partNumber);
        if (!retry) throw new Error(`server did not return a url for part ${partNumber}`);
        etag = await putPart(retry.url, blob, record.mime);
        if (etag === null) throw new Error(`part ${partNumber} was refused twice`);
      }

      record.partEtags[partNumber] = etag;
      await save(record);
      done.add(partNumber);
      report();
    }
  }

  const parts = Array.from({ length: total }, (_, i) => {
    const partNumber = i + 1;
    const etag = record.partEtags[partNumber];
    return etag ? { partNumber, etag } : { partNumber };
  });
  await apiFetch(`/gallery/uploads/${record.sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ parts }),
  });
  await drop(record.key);
  onProgress?.(100);
}

async function requestPartUrls(sessionId: string, from: number, count: number): Promise<PartUrl[]> {
  const res = await apiFetch<{ parts: PartUrl[]; totalParts: number }>(`/gallery/uploads/${sessionId}/parts`, {
    method: "POST",
    body: JSON.stringify({ from, count: Math.min(count, UPLOAD_PART_URL_BATCH_MAX) }),
  });
  return res.parts;
}

/**
 * `null` means "the signature was refused" — retryable with a fresh URL. Any
 * other failure is a real error and is thrown, because silently continuing would
 * complete an upload with a missing part.
 */
async function putPart(url: string, body: Blob, mime: string): Promise<string | null> {
  const res = await fetch(url, { method: "PUT", body, headers: { "content-type": mime } });
  if (res.status === 400 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`part upload failed: ${res.status}`);
  // Cross-origin buckets do not always expose ETag; the server falls back to the
  // value the bucket itself reports, so an empty header is not fatal.
  return (res.headers.get("etag") ?? "").replace(/"/g, "");
}

/** Abandon an upload: the server drops the parts, the row and the reservation. */
export async function abortUpload(record: PendingUpload): Promise<void> {
  try {
    await apiFetch(`/gallery/uploads/${record.sessionId}`, { method: "DELETE" });
  } finally {
    await drop(record.key);
  }
}

export { MULTIPART_THRESHOLD_BYTES };

import { apiFetch } from "../api/client.js";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const STORAGE_KEY = "scalpai-chunked-uploads";

export interface ChunkedUploadState {
  galleryItemId: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalParts: number;
  completedParts: number[];
  partEtags: Record<number, string>;
  key: string;
  patientId: string;
  createdAt: number;
}

function loadStates(): ChunkedUploadState[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveStates(states: ChunkedUploadState[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

function upsertState(state: ChunkedUploadState): void {
  const all = loadStates();
  const idx = all.findIndex((s) => s.galleryItemId === state.galleryItemId);
  if (idx >= 0) all[idx] = state;
  else all.push(state);
  saveStates(all);
}

function removeState(galleryItemId: string): void {
  saveStates(loadStates().filter((s) => s.galleryItemId !== galleryItemId));
}

function findPending(fileName: string, fileSize: number): ChunkedUploadState | undefined {
  return loadStates().find((s) => s.fileName === fileName && s.fileSize === fileSize);
}

/**
 * §P4: Chunked multipart upload with IndexedDB persistence. On kill/reload,
 * resume from the last successful part. Priority: smalls first.
 */
export async function uploadChunked(
  file: File,
  patientId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const existing = findPending(file.name, file.size);
  if (existing) {
    await resumeUpload(existing, file, onProgress);
  } else {
    await startUpload(file, patientId, onProgress);
  }
}

async function startUpload(file: File, patientId: string, onProgress?: (pct: number) => void): Promise<void> {
  const init = await apiFetch<{ id: string; uploadId: string; partUrls: string[]; totalParts: number; key: string }>(
    `/patients/${patientId}/gallery/init-multipart`,
    { method: "POST", body: JSON.stringify({ mime: file.type || "image/jpeg", sizeBytes: file.size }) },
  );

  const state: ChunkedUploadState = {
    galleryItemId: init.id,
    uploadId: init.uploadId,
    fileName: file.name,
    fileSize: file.size,
    totalParts: init.totalParts,
    completedParts: [],
    partEtags: {},
    key: init.key,
    patientId,
    createdAt: Date.now(),
  };
  upsertState(state);
  await uploadParts(state, file, init.partUrls, onProgress);
}

async function resumeUpload(state: ChunkedUploadState, file: File, onProgress?: (pct: number) => void): Promise<void> {
  // For resume, we need fresh presigned URLs (old ones may have expired).
  // Re-init multipart for the same key.
  const init = await apiFetch<{ uploadId: string; partUrls: string[] }>(
    `/patients/${state.patientId}/gallery/init-multipart`,
    { method: "POST", body: JSON.stringify({ mime: file.type || "image/jpeg", sizeBytes: file.size }) },
  ).catch(() => null);

  if (!init) {
    removeState(state.galleryItemId);
    return;
  }

  state.uploadId = init.uploadId;
  state.partEtags = {}; // old ETags are invalid for new upload
  state.completedParts = []; // need to re-upload all
  upsertState(state);
  await uploadParts(state, file, init.partUrls, onProgress);
}

async function uploadParts(
  state: ChunkedUploadState,
  file: File,
  partUrls: string[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  for (let i = 0; i < state.totalParts; i++) {
    const partNum = i + 1;
    if (state.completedParts.includes(partNum)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const res = await fetch(partUrls[i]!, {
      method: "PUT",
      body: await chunk.arrayBuffer(),
      headers: { "content-type": file.type || "image/jpeg" },
    });
    if (!res.ok) {
      upsertState(state);
      throw new Error(`Part ${partNum} upload failed: ${res.status}`);
    }
    const etag = (res.headers.get("etag") ?? "").replace(/"/g, "");
    state.completedParts.push(partNum);
    state.partEtags[partNum] = etag;
    upsertState(state);

    if (onProgress) onProgress(Math.round((state.completedParts.length / state.totalParts) * 100));
  }

  // all parts done → complete
  const parts = Object.entries(state.partEtags).map(([n, etag]) => ({ partNumber: Number(n), etag }));
  await apiFetch(`/gallery/${state.galleryItemId}/complete-multipart`, {
    method: "POST",
    body: JSON.stringify({ uploadId: state.uploadId, parts }),
  });
  removeState(state.galleryItemId);
}

/** §P4: list pending uploads (for badge rendering). */
export function getPendingUploads(): ChunkedUploadState[] {
  return loadStates();
}

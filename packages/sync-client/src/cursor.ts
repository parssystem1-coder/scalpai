/**
 * Commit-safe pull cursor (WEAKNESSES H5).
 *
 * `server_seq` on its own is NOT a safe cursor: a `bigserial` is handed out
 * BEFORE commit, so a slow transaction can commit seq 41 *after* a fast one
 * committed 42. A reader that saved "42" would skip 41 forever.
 *
 * The cursor is therefore a pair — the writing transaction id and the sequence:
 *
 *   (commit_xid, server_seq)
 *
 * and the server only serves rows whose `commit_xid` is below the snapshot xmin
 * watermark, i.e. rows that no still-running transaction can slip behind.
 */
export interface SyncCursor {
  /** PostgreSQL `xid8` serialized as digits (64-bit, monotonic). */
  xid: string;
  seq: number;
}

export const CURSOR_ZERO = "0:0";

const CURSOR_RE = /^(\d{1,20}):(\d{1,19})$/;

export function encodeCursor(cursor: SyncCursor): string {
  return `${cursor.xid}:${cursor.seq}`;
}

/** `null` means malformed — callers must refuse it instead of silently resetting. */
export function decodeCursor(value: string | null | undefined): SyncCursor | null {
  if (value === null || value === undefined || value.trim() === "") return { xid: "0", seq: 0 };
  const match = CURSOR_RE.exec(value.trim());
  if (!match) return null;
  return { xid: match[1]!, seq: Number(match[2]) };
}

/** Lexicographic order: transaction id first, sequence second. */
export function isCursorAhead(candidate: SyncCursor, reference: SyncCursor): boolean {
  const a = BigInt(candidate.xid);
  const b = BigInt(reference.xid);
  if (a !== b) return a > b;
  return candidate.seq > reference.seq;
}

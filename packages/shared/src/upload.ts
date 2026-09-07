import { z } from "zod";

/**
 * Resumable media upload contract — phase 8 (WEAKNESSES H7/H12, ADR-0041).
 *
 * The multipart endpoints used to take `{ uploadId, parts }` with `@Body()` and
 * NO schema at all: part numbers, ETag strings and array length were whatever
 * the caller felt like sending, and `totalParts` was computed from a size the
 * client also chose. Everything a part is allowed to be now lives here, on both
 * sides of the wire.
 */

/** Hard ceiling per image (also the mock driver's body limit). */
export const UPLOAD_MAX_BYTES = 52_428_800;
export const UPLOAD_MIN_BYTES = 1024;

/** Default part size. S3 refuses non-final parts under 5MiB, hence the floor. */
export const UPLOAD_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const UPLOAD_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_PART_SIZE_BYTES = UPLOAD_MAX_BYTES;

/** S3's own limit. Reached only with an absurd part size, but it is a real bound. */
export const UPLOAD_MAX_PARTS = 10_000;

/**
 * How many presigned part URLs one request may mint. Pre-minting every URL up
 * front was the other half of H7: by the time a slow uplink reached part 40 the
 * first URLs had expired, and the client had no way to ask for fresh ones.
 */
export const UPLOAD_PART_URL_BATCH_MAX = 16;

/** Below this a single presigned PUT is cheaper than a multipart handshake. */
export const MULTIPART_THRESHOLD_BYTES = UPLOAD_PART_SIZE_BYTES;

export const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadMime = (typeof UPLOAD_MIME_TYPES)[number];

/** ETags are opaque ASCII tokens; quotes are allowed because S3 returns them. */
const ETAG_PATTERN = /^[!-~]{1,256}$/;

export class UploadContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadContractError";
  }
}

export function normalizePartSize(partSizeBytes?: number | null): number {
  const size = partSizeBytes ?? UPLOAD_PART_SIZE_BYTES;
  if (!Number.isInteger(size) || size < UPLOAD_MIN_PART_SIZE_BYTES || size > UPLOAD_MAX_PART_SIZE_BYTES) {
    throw new UploadContractError("part size is outside the allowed range");
  }
  return size;
}

/**
 * The ONLY definition of how many parts a file has. Both the API and the client
 * call it, so "the client said 3 parts" can never disagree with the server.
 */
export function partCountFor(sizeBytes: number, partSizeBytes: number = UPLOAD_PART_SIZE_BYTES): number {
  if (!Number.isInteger(sizeBytes) || sizeBytes < UPLOAD_MIN_BYTES || sizeBytes > UPLOAD_MAX_BYTES) {
    throw new UploadContractError("upload size is outside the allowed range");
  }
  const part = normalizePartSize(partSizeBytes);
  const count = Math.ceil(sizeBytes / part);
  if (count < 1 || count > UPLOAD_MAX_PARTS) {
    throw new UploadContractError("part count is outside the allowed range");
  }
  return count;
}

export interface PartRange {
  partNumber: number;
  start: number;
  end: number;
  bytes: number;
}

/** Byte window of one part — shared so client slicing and server checks agree. */
export function partRange(partNumber: number, sizeBytes: number, partSizeBytes: number): PartRange {
  const total = partCountFor(sizeBytes, partSizeBytes);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > total) {
    throw new UploadContractError(`part number ${partNumber} is not part of this upload`);
  }
  const start = (partNumber - 1) * partSizeBytes;
  const end = Math.min(start + partSizeBytes, sizeBytes);
  return { partNumber, start, end, bytes: end - start };
}

export const UploadInit = z.object({
  mime: z.enum(UPLOAD_MIME_TYPES),
  sizeBytes: z.coerce.number().int().min(UPLOAD_MIN_BYTES).max(UPLOAD_MAX_BYTES),
  /**
   * Optional, and only ever a REQUEST: the server clamps it and stores what it
   * decided, because the part geometry has to survive a browser restart.
   */
  partSizeBytes: z.coerce
    .number()
    .int()
    .min(UPLOAD_MIN_PART_SIZE_BYTES)
    .max(UPLOAD_MAX_PART_SIZE_BYTES)
    .optional(),
});
export type UploadInitDto = z.infer<typeof UploadInit>;

/** Bounded window of presigned part URLs — minted on demand, never all at once. */
export const UploadPartUrlsRequest = z.object({
  from: z.coerce.number().int().min(1).max(UPLOAD_MAX_PARTS).default(1),
  count: z.coerce.number().int().min(1).max(UPLOAD_PART_URL_BATCH_MAX).default(UPLOAD_PART_URL_BATCH_MAX),
});
export type UploadPartUrlsRequestDto = z.infer<typeof UploadPartUrlsRequest>;

/**
 * One uploaded part.
 *
 * `etag` is OPTIONAL on purpose. A browser can only read the `ETag` response
 * header of a cross-origin PUT when the bucket exposes it, so demanding one made
 * completion fail for a reason no client could fix. The server takes the ETag it
 * sends to `CompleteMultipartUpload` from the BUCKET; when the client does supply
 * one it is compared, which turns it into an integrity check instead of a
 * requirement.
 */
export const UploadedPart = z.object({
  partNumber: z.coerce.number().int().min(1).max(UPLOAD_MAX_PARTS),
  etag: z.string().regex(ETAG_PATTERN, "etag معتبر نیست").optional(),
  sizeBytes: z.coerce.number().int().min(0).max(UPLOAD_MAX_BYTES).optional(),
});
export type UploadedPartDto = z.infer<typeof UploadedPart>;

/**
 * Completion. The parts must be a contiguous ascending run starting at 1: S3
 * rejects gaps anyway, but discovering that from a 400 out of the bucket after
 * the bytes were already sent is not a contract, it is a surprise.
 */
export const UploadComplete = z
  .object({
    parts: z.array(UploadedPart).min(1).max(UPLOAD_MAX_PARTS),
  })
  .superRefine((body, ctx) => {
    const numbers = body.parts.map((p) => p.partNumber);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["parts"], message: "شماره بخش تکراری است" });
      return;
    }
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parts", i, "partNumber"],
          message: "بخش‌ها باید از ۱ و به‌ترتیب پیوسته باشند",
        });
        return;
      }
    }
  });
export type UploadCompleteDto = z.infer<typeof UploadComplete>;

/** What `GET /gallery/uploads/:id` answers — the resume contract. */
export interface UploadSessionView {
  sessionId: string;
  galleryItemId: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  multipart: boolean;
  state: string;
  expiresAt: string;
  /** Parts the BUCKET confirms it already holds — never client bookkeeping. */
  uploadedParts: number[];
}

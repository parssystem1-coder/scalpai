import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UPLOAD_MAX_BYTES } from "@scalpai/shared";
import { derivedKey } from "../auth/jwt.config.js";
import { logEvent } from "../common/logging.js";
import { isProduction } from "../common/security.config.js";
import { envNumber } from "../common/state/kv.store.js";

export type StorageDriver = "s3" | "mock";

/** Hard ceiling for anything the mock driver will accept (matches the contract). */
export const MOCK_MAX_BODY_BYTES = UPLOAD_MAX_BYTES;
const MOCK_URL_TTL_MS = 15 * 60 * 1000;
const PRESIGN_TTL_SECONDS = 900;
const SNIFF_BYTES = 32;

/**
 * Every object key is `clinic-<uuid>/<safe path>`. The allowlist is positive:
 * anything that is not explicitly shaped like a tenant key is rejected, which
 * is what makes traversal impossible instead of merely inconvenient (C1).
 */
const KEY_PATTERN = /^clinic-[0-9a-fA-F-]{36}\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;

/**
 * Phase 8 (C1): the SHAPE of a media key, not just its prefix. The same pattern
 * is a CHECK constraint on `upload_sessions.storage_key` and `gallery_items`, so
 * a key the API would refuse cannot be smuggled in through a repository either.
 */
const MEDIA_REST_PATTERN = /^gallery\/[0-9a-fA-F-]{36}\/(original|thumb)\.(jpg|jpeg|png|webp)$/;

export function isAllowedStorageKey(key: string): boolean {
  if (!KEY_PATTERN.test(key)) return false;
  if (key.includes("..") || key.includes("\\") || key.includes("\0")) return false;
  if (key.includes("//")) return false;
  return true;
}

/** Clinic-relative media key: the only shape the gallery pipeline may produce. */
export function isAllowedMediaRest(rest: string): boolean {
  return MEDIA_REST_PATTERN.test(rest) && !rest.includes("..");
}

export function assertAllowedMediaRest(rest: string): string {
  if (!isAllowedMediaRest(rest)) {
    throw new Error("media key is not an allowed clinic-scoped media key");
  }
  return rest;
}

export function clinicIdFromKey(key: string): string | null {
  const match = /^clinic-([0-9a-fA-F-]{36})\//.exec(key);
  return match ? match[1]! : null;
}

export function resolveStorageDriver(): StorageDriver {
  const raw = (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase();
  if (raw === "mock") {
    if (isProduction()) {
      throw new Error("STORAGE_DRIVER=mock is forbidden in production");
    }
    return "mock";
  }
  if (raw !== "" && raw !== "s3") {
    throw new Error(`unknown STORAGE_DRIVER '${raw}' — use 's3' or 'mock'`);
  }
  return "s3";
}

export function isMockStorageEnabled(): boolean {
  return resolveStorageDriver() === "mock";
}

export interface ObjectHead {
  bytes: number;
  contentType: string | null;
}

export interface UploadedPartInfo {
  partNumber: number;
  etag: string;
  bytes: number;
}

export interface ObjectSize {
  key: string;
  bytes: number;
}

export class ObjectTooLargeError extends Error {
  constructor(readonly bytes: number, readonly maxBytes: number) {
    super(`object is ${bytes} bytes, over the ${maxBytes} byte ceiling`);
    this.name = "ObjectTooLargeError";
  }
}

/** Byte-capped passthrough: a lying Content-Length cannot become unbounded RAM. */
function boundedStream(source: Readable, maxBytes: number): Readable {
  let seen = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      if (seen > maxBytes) {
        done(new ObjectTooLargeError(seen, maxBytes));
        return;
      }
      done(null, chunk);
    },
  });
  source.on("error", (err) => limiter.destroy(err as Error));
  return source.pipe(limiter);
}

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client | null = null;
  private bucket: string;
  private localRoot = "";
  readonly driver: StorageDriver;
  /** Observable for the ops test: did the lifecycle policy actually apply? */
  lifecycleApplied = false;

  constructor() {
    this.driver = resolveStorageDriver();
    this.bucket = process.env.S3_BUCKET ?? "";

    if (this.driver === "s3") {
      const endpoint = process.env.S3_ENDPOINT;
      const accessKeyId = process.env.S3_ACCESS_KEY;
      const secretAccessKey = process.env.S3_SECRET_KEY;
      if (!endpoint) {
        throw new Error("S3_ENDPOINT is required (set STORAGE_DRIVER=mock for local dev without MinIO)");
      }
      if (!this.bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
      if (!accessKeyId || !secretAccessKey) {
        throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_DRIVER=s3");
      }
      this.s3 = new S3Client({
        endpoint,
        region: process.env.S3_REGION ?? "us-east-1",
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
        credentials: { accessKeyId, secretAccessKey },
      });
      return;
    }

    this.bucket = this.bucket || "scalpai-mock";
    this.localRoot = resolve(process.env.LOCAL_STORAGE_DIR ?? join(process.cwd(), ".local-storage"));
    if (!existsSync(this.localRoot)) {
      mkdirSync(this.localRoot, { recursive: true });
    }
  }

  static clinicKey(clinicId: string, rest: string): string {
    return `clinic-${clinicId}/${rest}`;
  }

  /** Mock-driver part object. Real S3 keeps parts itself; the mock needs a home. */
  static mockPartKey(key: string, partNumber: number): string {
    return `${key}.part-${String(partNumber).padStart(5, "0")}`;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
    await this.ensureLifecycle();
  }

  async ensureBucket(): Promise<void> {
    if (!this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        // bucket already exists or cannot be created
      }
    }
  }

  /**
   * Object lifecycle (WEAKNESSES M22). An interrupted multipart upload keeps its
   * parts in the bucket forever unless the BUCKET is told to abort them: no
   * application code ever runs for a client that simply never came back. The
   * clinical objects themselves are never expired here — retention is a clinical
   * decision and it runs through the purge flow (M21).
   */
  async ensureLifecycle(): Promise<void> {
    if (!this.s3) return;
    const days = Math.max(1, Math.round(envNumber("S3_ABORT_INCOMPLETE_DAYS", 7)));
    try {
      await this.s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "abort-incomplete-multipart-uploads",
                Status: "Enabled",
                Filter: { Prefix: "" },
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: days },
              },
            ],
          },
        }),
      );
      this.lifecycleApplied = true;
    } catch (err) {
      // Loud, not swallowed: a bucket without this rule leaks storage silently.
      logEvent("error", {
        event: "storage.lifecycle_not_applied",
        entity: "bucket",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ---------------- mock driver: signed URLs + contained disk paths ----------------

  /** URL signing uses a key derived from JWT_SECRET, never the secret itself. */
  static signMockKey(key: string, exp: number): string {
    return createHmac("sha256", derivedKey("mock-s3-url")).update(`${key}|${exp}`).digest("hex");
  }

  static verifyMockSignature(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    if (!isAllowedStorageKey(key)) return false;
    const expected = StorageService.signMockKey(key, exp);
    if (sig.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
  }

  private mockUrl(key: string, extra = ""): string {
    const base = process.env.MOCK_S3_PUBLIC_URL ?? "http://127.0.0.1:3000";
    const exp = Date.now() + MOCK_URL_TTL_MS;
    const sig = StorageService.signMockKey(key, exp);
    return `${base}/api/v1/mock-s3?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}${extra}`;
  }

  /** path.resolve + containment check — the only way a local path is produced. */
  private localPath(key: string): string {
    if (!isAllowedStorageKey(key)) {
      throw new Error("storage key is not an allowed tenant key");
    }
    const full = resolve(this.localRoot, key);
    const rootPrefix = this.localRoot.endsWith(sep) ? this.localRoot : `${this.localRoot}${sep}`;
    if (!full.startsWith(rootPrefix)) {
      throw new Error("storage key escapes the storage root");
    }
    return full;
  }

  async readMockObject(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.localPath(key));
    } catch {
      return null;
    }
  }

  async writeMockObject(key: string, body: Buffer): Promise<void> {
    if (body.length > MOCK_MAX_BODY_BYTES) {
      throw new Error("mock storage object exceeds the maximum allowed size");
    }
    const filePath = this.localPath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  /**
   * Store one part of a mock multipart upload. Phase 8 replaced the previous
   * `appendMockObject`: appending made part order and retries meaningless, so the
   * dev/test driver could never exercise a real resume. Each part is now its own
   * object with its own ETag, exactly like S3.
   */
  async writeMockPart(key: string, partNumber: number, body: Buffer): Promise<string> {
    await this.writeMockObject(StorageService.mockPartKey(key, partNumber), body);
    return createHash("md5").update(body).digest("hex");
  }

  // ---------------- driver-agnostic object API ----------------

  async presignPut(clinicId: string, rest: string, contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) return this.mockUrl(key);
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.s3, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  async presignGet(clinicId: string, rest: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) return this.mockUrl(key);
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  /**
   * Size and type WITHOUT downloading (WEAKNESSES H12). Every read path calls
   * this first: the 50MB contract used to be enforced by a zod field the client
   * filled in, while the server happily buffered whatever the bucket held.
   */
  async headObject(clinicId: string, rest: string): Promise<ObjectHead | null> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) {
      try {
        const info = await stat(this.localPath(key));
        return { bytes: info.size, contentType: null };
      } catch {
        return null;
      }
    }
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: Number(res.ContentLength ?? 0), contentType: res.ContentType ?? null };
    } catch {
      return null;
    }
  }

  /** First bytes only — enough to sniff magic bytes without a full download. */
  async getObjectRange(clinicId: string, rest: string, length = SNIFF_BYTES): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) {
      const data = await this.readMockObject(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      return data.subarray(0, length);
    }
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${Math.max(0, length - 1)}` }),
    );
    if (!res.Body) throw new Error(`Empty body for object: ${key}`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  /**
   * Streamed read with a hard byte cap. `maxBytes` is checked against the HEAD
   * result AND enforced on the stream itself, because a bucket is not a trusted
   * narrator of its own object sizes.
   */
  async getObjectStream(clinicId: string, rest: string, maxBytes: number): Promise<{ stream: Readable; bytes: number }> {
    const head = await this.headObject(clinicId, rest);
    if (!head) throw new Error(`Object not found: ${rest}`);
    if (head.bytes > maxBytes) throw new ObjectTooLargeError(head.bytes, maxBytes);

    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      const data = await this.readMockObject(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      if (data.length > maxBytes) throw new ObjectTooLargeError(data.length, maxBytes);
      return { stream: Readable.from(data), bytes: data.length };
    }
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty body for object: ${key}`);
    const source = res.Body as unknown as Readable;
    return { stream: boundedStream(source, maxBytes), bytes: head.bytes };
  }

  /**
   * Buffered read, still bounded. Kept for the small objects (consent
   * signatures); the image pipeline uses `getObjectStream`.
   */
  async getObject(clinicId: string, rest: string, maxBytes: number = UPLOAD_MAX_BYTES): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, rest);
    const head = await this.headObject(clinicId, rest).catch(() => null);
    if (head && head.bytes > maxBytes) throw new ObjectTooLargeError(head.bytes, maxBytes);
    if (!this.s3) {
      const data = await this.readMockObject(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      if (data.length > maxBytes) throw new ObjectTooLargeError(data.length, maxBytes);
      return data;
    }
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty body for object: ${key}`);
    const bytes = await res.Body.transformToByteArray();
    if (bytes.length > maxBytes) throw new ObjectTooLargeError(bytes.length, maxBytes);
    return Buffer.from(bytes);
  }

  async putBuffer(clinicId: string, rest: string, body: Buffer, contentType: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      await this.writeMockObject(key, body);
      return;
    }
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async removeObject(clinicId: string, rest: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      try {
        await unlink(this.localPath(key));
      } catch {
        // object may not exist on disk
      }
      return;
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /* ---------------- maintenance surface (WEAKNESSES M22) ---------------- */

  /**
   * Every object under one clinic's prefix. Reconciliation compares this against
   * the live rows, so it must be the FULL listing — pagination included.
   */
  async listClinicObjects(clinicId: string): Promise<string[]> {
    return (await this.listClinicObjectSizes(clinicId)).map((o) => o.key);
  }

  /**
   * Listing WITH sizes (phase 8 / M22). The storage total was previously a
   * guess: nothing ever measured the bucket, so a plan's `storage_mb` could not
   * be enforced against anything real.
   */
  async listClinicObjectSizes(clinicId: string): Promise<ObjectSize[]> {
    const prefix = `clinic-${clinicId}/`;

    if (!this.s3) {
      const root = resolve(this.localRoot, prefix);
      const out: ObjectSize[] = [];
      const walk = async (dir: string): Promise<void> => {
        let entries: Array<{ name: string; isDirectory(): boolean }>;
        try {
          entries = (await readdir(dir, { withFileTypes: true })) as unknown as Array<{
            name: string;
            isDirectory(): boolean;
          }>;
        } catch {
          return; // clinic has no objects yet
        }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
            continue;
          }
          const key = `${prefix}${full.slice(root.length + 1).split(sep).join("/")}`;
          if (!isAllowedStorageKey(key)) continue;
          const info = await stat(full).catch(() => null);
          out.push({ key, bytes: info?.size ?? 0 });
        }
      };
      await walk(root);
      return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }

    const objects: ObjectSize[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key && isAllowedStorageKey(obj.Key)) {
          objects.push({ key: obj.Key, bytes: Number(obj.Size ?? 0) });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /**
   * Delete by FULL key (the shape the orphan queue stores). The clinic id is
   * passed separately and must match the key's own prefix — a queue row can never
   * be used to reach into another tenant's prefix.
   */
  async removeObjectByKey(clinicId: string, fullKey: string): Promise<void> {
    if (!isAllowedStorageKey(fullKey)) throw new Error("storage key is not an allowed tenant key");
    if (clinicIdFromKey(fullKey) !== clinicId) {
      throw new Error("storage key belongs to another clinic");
    }
    if (!this.s3) {
      await unlink(this.localPath(fullKey));
      return;
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: fullKey }));
  }

  /* ---------------- multipart (WEAKNESSES H7/H12) ---------------- */

  /**
   * Start a multipart upload and return ONLY its id. Part URLs are minted later,
   * a window at a time (`presignUploadPart`): pre-signing all of them meant the
   * early URLs had expired by the time a slow uplink reached the later parts, and
   * that is precisely why "resume" used to restart from part 1.
   */
  async createMultipartUpload(clinicId: string, rest: string, contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) return `mock-${randomUUID()}`;
    const create = await this.s3.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    if (!create.UploadId) throw new Error("bucket did not return an upload id");
    return create.UploadId;
  }

  async presignUploadPart(clinicId: string, rest: string, uploadId: string, partNumber: number): Promise<string> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) return this.mockUrl(key, `&part=${partNumber}`);
    return getSignedUrl(
      this.s3,
      new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
  }

  /**
   * What the bucket already holds. This is the answer a resume is built on — the
   * client's own list of "completed parts" is a hint at best and a lie after a
   * crash.
   */
  async listParts(clinicId: string, rest: string, uploadId: string): Promise<UploadedPartInfo[]> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) {
      const dir = dirname(this.localPath(key));
      const base = `${key.split("/").pop()!}.part-`;
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return [];
      }
      const parts: UploadedPartInfo[] = [];
      for (const name of entries) {
        if (!name.startsWith(base)) continue;
        const partNumber = Number(name.slice(base.length));
        if (!Number.isInteger(partNumber) || partNumber < 1) continue;
        const data = await readFile(join(dir, name)).catch(() => null);
        if (!data) continue;
        parts.push({ partNumber, etag: createHash("md5").update(data).digest("hex"), bytes: data.length });
      }
      return parts.sort((a, b) => a.partNumber - b.partNumber);
    }

    const parts: UploadedPartInfo[] = [];
    let marker: number | undefined;
    do {
      const page = await this.s3.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker === undefined ? undefined : String(marker),
        }),
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber === undefined) continue;
        parts.push({
          partNumber: part.PartNumber,
          etag: (part.ETag ?? "").replace(/"/g, ""),
          bytes: Number(part.Size ?? 0),
        });
      }
      marker = page.IsTruncated && page.NextPartNumberMarker ? Number(page.NextPartNumberMarker) : undefined;
    } while (marker !== undefined);
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(
    clinicId: string,
    rest: string,
    uploadId: string,
    parts: ReadonlyArray<{ partNumber: number; etag: string }>,
  ): Promise<void> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) {
      // Assemble the mock object from its parts, in order, then drop the parts.
      const chunks: Buffer[] = [];
      for (const part of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        const partKey = StorageService.mockPartKey(key, part.partNumber);
        const data = await this.readMockObject(partKey);
        if (!data) throw new Error(`mock part ${part.partNumber} is missing`);
        chunks.push(data);
      }
      await this.writeMockObject(key, Buffer.concat(chunks));
      for (const part of parts) {
        await unlink(this.localPath(StorageService.mockPartKey(key, part.partNumber))).catch(() => undefined);
      }
      return;
    }
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(clinicId: string, rest: string, uploadId: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, assertAllowedMediaRest(rest));
    if (!this.s3) {
      const existing = await this.listParts(clinicId, rest, uploadId);
      for (const part of existing) {
        await unlink(this.localPath(StorageService.mockPartKey(key, part.partNumber))).catch(() => undefined);
      }
      return;
    }
    await this.s3.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }
}

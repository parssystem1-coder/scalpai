import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { derivedKey } from "../auth/jwt.config.js";
import { isProduction } from "../common/security.config.js";

export type StorageDriver = "s3" | "mock";

/** Hard ceiling for anything the mock driver will accept (matches GalleryInit). */
export const MOCK_MAX_BODY_BYTES = 52_428_800;
const MOCK_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Every object key is `clinic-<uuid>/<safe path>`. The allowlist is positive:
 * anything that is not explicitly shaped like a tenant key is rejected, which
 * is what makes traversal impossible instead of merely inconvenient (C1).
 */
const KEY_PATTERN = /^clinic-[0-9a-fA-F-]{36}\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;

export function isAllowedStorageKey(key: string): boolean {
  if (!KEY_PATTERN.test(key)) return false;
  if (key.includes("..") || key.includes("\\") || key.includes("\0")) return false;
  if (key.includes("//")) return false;
  return true;
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

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client | null = null;
  private bucket: string;
  private localRoot = "";
  readonly driver: StorageDriver;

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

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
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

  async appendMockObject(key: string, body: Buffer): Promise<void> {
    const existing = (await this.readMockObject(key)) ?? Buffer.alloc(0);
    await this.writeMockObject(key, Buffer.concat([existing, body]));
  }

  // ---------------- driver-agnostic object API ----------------

  async presignPut(clinicId: string, rest: string, contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return this.mockUrl(key);
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  async presignGet(clinicId: string, rest: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return this.mockUrl(key);
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  async getObject(clinicId: string, rest: string): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      const data = await this.readMockObject(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      return data;
    }
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty body for object: ${key}`);
    const bytes = await res.Body.transformToByteArray();
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

  async initiateMultipartUpload(
    clinicId: string,
    rest: string,
    contentType: string,
    totalParts: number,
  ): Promise<{ uploadId: string; partUrls: string[] }> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      const uploadId = `mock-${randomUUID()}`;
      const partUrls = Array.from({ length: totalParts }, (_, i) => this.mockUrl(key, `&part=${i + 1}`));
      return { uploadId, partUrls };
    }
    const create = await this.s3.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    const uploadId = create.UploadId!;
    const partUrls: string[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const url = await getSignedUrl(
        this.s3,
        new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: 900 },
      );
      partUrls.push(url);
    }
    return { uploadId, partUrls };
  }

  async completeMultipartUpload(
    clinicId: string,
    rest: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return;
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(clinicId: string, rest: string, uploadId: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return;
    await this.s3.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }
}

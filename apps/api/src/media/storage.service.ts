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

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client | null = null;
  private bucket: string;
  private inMemoryMap = new Map<string, Buffer>();

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "scalpai-dev";
    if (process.env.S3_ENDPOINT) {
      this.s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
          secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin-dev-only",
        },
      });
    } else {
      console.warn("[AI Studio] S3_ENDPOINT not set — using in-memory storage");
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

  async presignPut(clinicId: string, rest: string, contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      return `http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}`;
    }
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  async presignGet(clinicId: string, rest: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      return `http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}`;
    }
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  async getObject(clinicId: string, rest: string): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      const data = this.inMemoryMap.get(key);
      if (!data) {
        throw new Error(`Object not found: ${key}`);
      }
      return data;
    }
    const res = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!res.Body) {
      throw new Error(`Empty body for object: ${key}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async putBuffer(clinicId: string, rest: string, body: Buffer, contentType: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      this.inMemoryMap.set(key, body);
      return;
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async removeObject(clinicId: string, rest: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      this.inMemoryMap.delete(key);
      return;
    }
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async initiateMultipartUpload(clinicId: string, rest: string, contentType: string, totalParts: number): Promise<{ uploadId: string; partUrls: string[] }> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) {
      const uploadId = "mock-upload-id";
      const partUrls = Array.from({ length: totalParts }, (_, i) => `http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}?part=${i + 1}`);
      return { uploadId, partUrls };
    }
    const create = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    const uploadId = create.UploadId!;
    const partUrls: string[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const url = await getSignedUrl(
        this.s3,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: 900 },
      );
      partUrls.push(url);
    }
    return { uploadId, partUrls };
  }

  async completeMultipartUpload(clinicId: string, rest: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return;
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }),
    );
  }

  async abortMultipartUpload(clinicId: string, rest: string, uploadId: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    if (!this.s3) return;
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
}

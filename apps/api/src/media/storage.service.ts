import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PUT_TTL_S = 300; // short-lived by design (DESIGN §7 layer 4)
const GET_TTL_S = 600;

/**
 * The ONLY door to object storage (ADR-0026). Every key must live under
 * `clinic-{clinicId}/...` — enforced centrally so no caller can escape the
 * tenant prefix (DESIGN §7 layer 4).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "scalpai-dev";
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin-dev-only",
      },
    });
  }

  static clinicKey(clinicId: string, rest: string): string {
    return `clinic-${clinicId}/${rest}`;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  presignPut(clinicId: string, rest: string, contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: PUT_TTL_S });
  }

  presignGet(clinicId: string, rest: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: GET_TTL_S });
  }

  async getObject(clinicId: string, rest: string): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, rest);
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async putBuffer(clinicId: string, rest: string, body: Buffer, contentType: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async removeObject(clinicId: string, rest: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

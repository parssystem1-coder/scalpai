import { Injectable, type OnModuleInit } from "@nestjs/common";

const MOCK_STORAGE = new Map<string, Buffer>();

@Injectable()
export class StorageService implements OnModuleInit {
  constructor() {
    console.warn('[AI Studio] StorageService not connected to S3 — using in-memory mock');
  }

  static clinicKey(clinicId: string, rest: string): string {
    return `clinic-${clinicId}/${rest}`;
  }

  async onModuleInit(): Promise<void> {
  }

  async ensureBucket(): Promise<void> {
  }

  async presignPut(clinicId: string, rest: string, _contentType: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    // Return a mock URL that we can intercept if we had an endpoint, but since it's signed URL, 
    // the frontend will try to PUT to it. We need a local API endpoint for it, or just return a dummy.
    // If the frontend tries to PUT to this, it will fail unless we add a handler. 
    return `http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}`;
  }

  async presignGet(clinicId: string, rest: string): Promise<string> {
    const key = StorageService.clinicKey(clinicId, rest);
    return `http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}`;
  }

  async getObject(clinicId: string, rest: string): Promise<Buffer> {
    const key = StorageService.clinicKey(clinicId, rest);
    return MOCK_STORAGE.get(key) || Buffer.from('');
  }

  async putBuffer(clinicId: string, rest: string, body: Buffer, _contentType: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    MOCK_STORAGE.set(key, body);
  }

  async removeObject(clinicId: string, rest: string): Promise<void> {
    const key = StorageService.clinicKey(clinicId, rest);
    MOCK_STORAGE.delete(key);
  }

  async initiateMultipartUpload(clinicId: string, rest: string, _contentType: string, totalParts: number): Promise<{ uploadId: string; partUrls: string[] }> {
    const key = StorageService.clinicKey(clinicId, rest);
    const uploadId = "mock-upload-id";
    const partUrls: string[] = [];
    for (let i = 1; i <= totalParts; i++) {
      partUrls.push(`http://localhost:3000/api/v1/mock-s3/${encodeURIComponent(key)}?part=${i}`);
    }
    return { uploadId, partUrls };
  }

  async completeMultipartUpload(_clinicId: string, _rest: string, _uploadId: string, _parts: { partNumber: number; etag: string }[]): Promise<void> {
  }

  async abortMultipartUpload(_clinicId: string, _rest: string, _uploadId: string): Promise<void> {
  }
}

import { Controller, Get, Put, Query, Req, Res } from "@nestjs/common";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit, DbService } from "@scalpai/db";
import { errors } from "@scalpai/shared";
import { Public } from "../auth/jwt-access.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import {
  clinicIdFromKey,
  isAllowedStorageKey,
  MOCK_MAX_BODY_BYTES,
  StorageService,
} from "./storage.service.js";

/**
 * Dev/test object store, reachable ONLY when STORAGE_DRIVER=mock outside
 * production (WEAKNESSES C1/R1). It replaces the unauthenticated raw Fastify
 * routes that used to live in main.ts:
 *   - every request must carry a short-lived HMAC signature bound to the key
 *   - keys must match the clinic-scoped allowlist (no traversal, no escape)
 *   - bodies are size-capped by the parser AND re-checked before writing
 *   - reads and writes both land in the audit chain
 */

const PARSED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/octet-stream"];

export function registerMockStorageParsers(fastify: FastifyInstance): void {
  for (const type of PARSED_TYPES) {
    if (fastify.hasContentTypeParser(type)) continue;
    fastify.addContentTypeParser(
      type,
      { parseAs: "buffer", bodyLimit: MOCK_MAX_BODY_BYTES },
      (_req, body, done) => {
        done(null, body);
      },
    );
  }
}

const MockObjectQuery = z.object({
  key: z.string().min(9).max(300),
  exp: z.coerce.number().int().positive(),
  sig: z.string().length(64),
  part: z.coerce.number().int().min(1).max(10_000).optional(),
});
type MockObjectQueryDto = z.infer<typeof MockObjectQuery>;

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

@Public()
@Controller("mock-s3")
export class MockStorageController {
  constructor(
    private storage: StorageService,
    private db: DbService,
  ) {}

  private assertSignature(q: MockObjectQueryDto): string {
    if (!isAllowedStorageKey(q.key)) throw errors.forbidden();
    if (!StorageService.verifyMockSignature(q.key, q.exp, q.sig)) throw errors.forbidden();
    const clinicId = clinicIdFromKey(q.key);
    if (!clinicId) throw errors.forbidden();
    return clinicId;
  }

  private async audit(clinicId: string, key: string, action: string, bytes: number | null): Promise<void> {
    await this.db.withTenant(clinicId, null, (tx) =>
      appendAudit(tx, {
        clinicId,
        userId: null,
        action,
        entity: "mock_storage_object",
        entityId: key,
        meta: bytes === null ? null : { bytes },
      }),
    );
  }

  @Public()
  @Get()
  async get(
    @Query(new ZodBodyPipe(MockObjectQuery)) q: MockObjectQueryDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const clinicId = this.assertSignature(q);
    const data = await this.storage.readMockObject(q.key);
    if (!data) throw errors.notFound();
    await this.audit(clinicId, q.key, "mock_storage.read", data.length);
    void reply.type(contentTypeFor(q.key)).send(data);
  }

  @Public()
  @Put()
  async put(
    @Query(new ZodBodyPipe(MockObjectQuery)) q: MockObjectQueryDto,
    @Req() req: FastifyRequest,
  ): Promise<{ ok: true; etag: string; bytes: number }> {
    const clinicId = this.assertSignature(q);

    const raw = req.body;
    const body = typeof raw === "string" ? Buffer.from(raw) : Buffer.isBuffer(raw) ? raw : null;
    if (!body) throw errors.invalidImage();
    if (body.length > MOCK_MAX_BODY_BYTES) throw errors.validation({ bytes: body.length });

    if (q.part === undefined) {
      await this.storage.writeMockObject(q.key, body);
    } else {
      await this.storage.appendMockObject(q.key, body);
    }
    await this.audit(clinicId, q.key, "mock_storage.write", body.length);
    return { ok: true, etag: `"mock-${q.exp}-${body.length}"`, bytes: body.length };
  }
}

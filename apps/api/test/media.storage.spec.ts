import { loadEnv, migrate } from "@scalpai/db";

loadEnv();

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StorageService } from "../src/media/storage.service.js";

/**
 * Slice M1 — real presign roundtrip against native MinIO (ADR-0026).
 * Proves: tenant key-scheme enforcement, PUT via presigned URL, GET back,
 * server-side object access, removal.
 */

let storage: StorageService;

beforeAll(async () => {
  await migrate(process.env.MIGRATE_DATABASE_URL!);
  storage = new StorageService();
  await storage.ensureBucket();
}, 30_000);

describe("storage (native MinIO, ADR-0026)", () => {
  it("enforces the clinic-{id}/ tenant prefix", () => {
    const a = randomUUID();
    expect(() => StorageService.clinicKey(a, "img/x.jpg")).not.toThrow();
    // the only door prefixes keys itself; a raw foreign key can never be formed
    const key = StorageService.clinicKey(a, "probe.txt");
    expect(key.startsWith(`clinic-${a}/`)).toBe(true);
  });

  it("roundtrips bytes through presigned PUT and GET", async () => {
    const clinicId = randomUUID();
    const rest = `probe/${randomUUID()}.txt`;
    const putUrl = await storage.presignPut(clinicId, rest, "text/plain");

    const put = await fetch(putUrl, { method: "PUT", body: "hello-scalpai" });
    expect(put.status).toBe(200);

    const got = await storage.getObject(clinicId, rest);
    expect(got.toString()).toBe("hello-scalpai");

    const getUrl = await storage.presignGet(clinicId, rest);
    const get = await fetch(getUrl);
    expect(get.status).toBe(200);
    expect(await get.text()).toBe("hello-scalpai");

    await storage.removeObject(clinicId, rest);
    await expect(storage.getObject(clinicId, rest)).rejects.toBeTruthy();
  });

  it("keeps tenants apart inside the bucket", async () => {
    const a = randomUUID();
    const b = randomUUID();
    await storage.putBuffer(a, "secret.txt", Buffer.from("clinic-a-secret"), "text/plain");
    // B cannot read A's object even knowing its REST path — getObject always
    // re-prefixes with B's own clinic id.
    await expect(storage.getObject(b, "secret.txt")).rejects.toBeTruthy();
    await storage.removeObject(a, "secret.txt");
  });
});

afterAll(async () => {
  // nothing persistent to close — S3Client manages its own connections
});

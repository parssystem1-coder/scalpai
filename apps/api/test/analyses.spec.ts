import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { resetAll, seedMarkerClinicId } from "@scalpai/db/testing";
import { ANALYSIS_MODEL_REGISTRY, modelRefOf, sha256HexOfText } from "@scalpai/shared";
import { AppModule } from "../src/app.module.js";

/** Slice M5 — analyses persistence + expert review contract on real PG. */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };
const B = { email: "owner@clinic-b.test", password: "Dev12345!" };

const MODEL = ANALYSIS_MODEL_REGISTRY[0]!;

/**
 * Phase 10 (H13): a submission has to say WHICH pixels and WHICH model produced
 * it. `label` only varies the digest so two tests never look like the same image.
 */
function provenance(label: string, overrides: Record<string, unknown> = {}) {
  return {
    imageSha256: sha256HexOfText(`pixels:${label}`),
    pixelWidth: 1024,
    pixelHeight: 768,
    model: modelRefOf(MODEL),
    computedAt: new Date().toISOString(),
    diagnostic: false,
    ...overrides,
  };
}

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

beforeAll(async () => {
  await migrate(process.env.MIGRATE_DATABASE_URL!);
  await resetAll(process.env.MIGRATE_DATABASE_URL!);
  await seed(process.env.MIGRATE_DATABASE_URL!);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);
}, 30_000);

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

describe("analyses (playbook 2.3)", () => {
  it("persists a submitted heuristic result and returns it", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const patient = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "تحلیل", lastName: "تست", phone: `0912${Date.now()}`.slice(0, 11) });
    const pid = String(patient.body.id);

    // Phase 8 (ADR-0041) replaced `gallery/init` with the upload-session endpoint.
    // Opening the upload is all the analyses FK needs: the gallery item row exists
    // as `pending` from here on, and completion would need real bytes in the
    // bucket.
    const init = await http
      .post(`/api/v1/patients/${pid}/gallery/uploads`)
      .set(auth)
      .send({ mime: "image/jpeg", sizeBytes: 200_000 });
    expect(init.status).toBe(201);

    const submit = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({
        patientId: pid,
        galleryItemId: init.body.id,
        result: {
          scores: { redness: 42, flakeTexture: 17, densityProxy: 88 },
          severity: 47,
          modelVersion: MODEL.version,
          provenance: provenance("persist"),
        },
      });
    expect(submit.status).toBe(201);
    expect(String(submit.body.id)).toBeTruthy();

    const got = await http.get(`/api/v1/analyses/${submit.body.id}`).set(auth);
    expect(got.status).toBe(200);
    expect(got.body.result.scores.redness).toBe(42);
    expect(got.body.type).toBe("heuristic");

    // audit chain still intact after these writes
    const { verifyChain } = await import("@scalpai/db");
    const clinicId = await seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
    expect(await db.withTenant(clinicId, null, (tx) => verifyChain(tx, clinicId))).toBe(true);
  });

  it("expert review stores Gold-label with reviewer identity", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };

    const patient = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "گلد", lastName: "لیبل", phone: `0935${Date.now()}`.slice(0, 11) });
    const pid = String(patient.body.id);
    const init = await http
      .post(`/api/v1/patients/${pid}/gallery/uploads`)
      .set(auth)
      .send({ mime: "image/jpeg", sizeBytes: 200_000 });
    const submit = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({
        patientId: pid,
        galleryItemId: init.body.id,
        result: {
          scores: { redness: 10, flakeTexture: 20, densityProxy: 30 },
          severity: 19,
          modelVersion: MODEL.version,
          provenance: provenance("gold-label"),
        },
      });
    const id = String(submit.body.id);

    const rev = await http.patch(`/api/v1/analyses/${id}/expert-review`).set(auth).send({
      verdict: "adjust",
      adjustedScores: { redness: 15, flakeTexture: 22, densityProxy: 35 },
      note: "کمی قرمزی بیشتر",
    });
    expect(rev.status).toBe(200);
    expect(rev.body.expertReview.verdict).toBe("adjust");
    expect(rev.body.expertReview.adjustedScores.redness).toBe(15);
    expect(rev.body.expertReview.reviewedBy).toBeTruthy();
  });

  it("rejects invalid payloads with canonical error", async () => {
    const token = await login(A);
    const res = await http.post("/api/v1/analyses").set("Authorization", `Bearer ${token}`).send({ patientId: "x" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("isolates tenants on read", async () => {
    const a = await login(A);
    const b = await login(B);
    const patient = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a}`)
      .send({ firstName: "X", lastName: "Y", phone: `0912${String(Date.now()).slice(-6)}9` });
    const pid = String(patient.body.id);
    const init = await http
      .post(`/api/v1/patients/${pid}/gallery/uploads`)
      .set("Authorization", `Bearer ${a}`)
      .send({ mime: "image/jpeg", sizeBytes: 200_000 });
    const submit = await http
      .post("/api/v1/analyses")
      .set("Authorization", `Bearer ${a}`)
      .send({
        patientId: pid,
        galleryItemId: init.body.id,
        result: {
          scores: { redness: 1, flakeTexture: 2, densityProxy: 3 },
          severity: 2,
          modelVersion: MODEL.version,
          provenance: provenance("tenant-isolation"),
        },
      });

    const leak = await http
      .get(`/api/v1/analyses/${submit.body.id}`)
      .set("Authorization", `Bearer ${b}`);
    expect(leak.status).toBe(404);
  });
});

/**
 * Phase 10 (H13). The server cannot recompute a client-side analysis, so the one
 * thing it CAN do is refuse a result that does not say what produced it. These
 * are the refusals that turn "the client claims heuristic-v0" into something
 * checkable.
 */
describe("analysis provenance is enforced server-side (H13)", () => {
  async function setup(): Promise<{ auth: { Authorization: string }; pid: string; gid: string }> {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const patient = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "پرووننس", lastName: "تست", phone: `0919${Date.now()}`.slice(0, 11) });
    const pid = String(patient.body.id);
    const init = await http
      .post(`/api/v1/patients/${pid}/gallery/uploads`)
      .set(auth)
      .send({ mime: "image/jpeg", sizeBytes: 200_000 });
    return { auth, pid, gid: String(init.body.id) };
  }

  it("refuses a submission with no provenance at all", async () => {
    const { auth, pid, gid } = await setup();
    const res = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({
        patientId: pid,
        galleryItemId: gid,
        result: { scores: { redness: 5, flakeTexture: 5, densityProxy: 5 }, severity: 5, modelVersion: MODEL.version },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a model version that is not in the platform registry", async () => {
    const { auth, pid, gid } = await setup();
    const res = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({
        patientId: pid,
        galleryItemId: gid,
        result: {
          scores: { redness: 5, flakeTexture: 5, densityProxy: 5 },
          severity: 5,
          modelVersion: "scalp-gpt-v7",
          provenance: provenance("unknown-model", {
            model: { ...modelRefOf(MODEL), version: "scalp-gpt-v7" },
          }),
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a modelVersion that disagrees with the manifest it shipped", async () => {
    const { auth, pid, gid } = await setup();
    const res = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({
        patientId: pid,
        galleryItemId: gid,
        result: {
          scores: { redness: 5, flakeTexture: 5, densityProxy: 5 },
          severity: 5,
          modelVersion: "heuristic-v9",
          provenance: provenance("mismatch"),
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a digest that is not a sha256, and a client claiming diagnostic scope", async () => {
    const { auth, pid, gid } = await setup();
    const base = {
      patientId: pid,
      galleryItemId: gid,
      result: { scores: { redness: 5, flakeTexture: 5, densityProxy: 5 }, severity: 5, modelVersion: MODEL.version },
    };

    const badDigest = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({ ...base, result: { ...base.result, provenance: provenance("x", { imageSha256: "not-a-digest" }) } });
    expect(badDigest.status).toBe(400);

    const claimsDiagnostic = await http
      .post("/api/v1/analyses")
      .set(auth)
      .send({ ...base, result: { ...base.result, provenance: provenance("y", { diagnostic: true }) } });
    expect(claimsDiagnostic.status).toBe(400);
  });
});

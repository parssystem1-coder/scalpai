import { describe, expect, it } from "vitest";
import {
  CURSOR_ZERO,
  MutationContractError,
  Outbox,
  SCHEMA_VERSION_CURRENT,
  decodeCursor,
  encodeCursor,
  isCursorAhead,
  isSchemaVersionSupported,
  makeMutation,
  mergeFieldLww,
  outboxPriority,
  type FieldPatch,
  type MutationEnvelope,
  type ServerRow,
} from "./index.js";

const patient = (over: Record<string, unknown> = {}) => ({
  firstName: "علی",
  lastName: "رضایی",
  phone: "09120000000",
  ...over,
});

describe("mutation envelope (phase 7 contract)", () => {
  it("stamps the current schema version, a fresh uuid and the base version", () => {
    const m = makeMutation("patients", "update", { phone: "09120000001" }, 3);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION_CURRENT);
    expect(m.clientMutationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.baseVersion).toBe(3);
  });

  it("refuses an update without the server baseVersion (H6)", () => {
    expect(() => makeMutation("patients", "update", { phone: "09120000001" })).toThrow(MutationContractError);
  });

  it("refuses an entity outside the §8 contract at enqueue time", () => {
    // The consent modal used to forge `"consents" as "patients"`, which 400s the
    // whole batch on the server and stalls everything queued behind it.
    expect(() => makeMutation("consents" as "patients", "create", {})).toThrow(MutationContractError);
  });

  it("only accepts schema versions that actually exist", () => {
    expect(isSchemaVersionSupported(1)).toBe(true);
    expect(isSchemaVersionSupported(2)).toBe(false);
    expect(isSchemaVersionSupported(99)).toBe(false);
  });

  it("keeps the device clock as metadata", () => {
    const m = makeMutation("patients", "create", patient(), null, 45_000);
    expect(m.clientClockOffsetMs).toBe(45_000);
    expect(m.clientUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("field merge on server versions (H6) — two devices, one patient", () => {
  // server changed `phone` at version 7 and `lastName` at version 4
  const server: ServerRow = { rowVersion: 7, fieldVersions: { phone: 7, lastName: 4 } };

  const mut = (patch: FieldPatch, base: number | null): MutationEnvelope<FieldPatch> => ({
    clientMutationId: "00000000-0000-4000-8000-000000000001",
    entity: "patients",
    op: "update",
    schemaVersion: 1,
    clientUpdatedAt: "2026-08-26T12:00:00Z",
    baseVersion: base,
    payload: patch,
  });

  it("applies fields the server has not touched since the base version", () => {
    const out = mergeFieldLww(server, mut({ gender: "female", lastName: "احمدی" }, 5));
    expect(out).toEqual({ action: "apply", fields: { gender: "female", lastName: "احمدی" }, conflicts: [] });
  });

  it("keeps the server value for a field changed after the base version", () => {
    const out = mergeFieldLww(server, mut({ phone: "09121111111", gender: "male" }, 5));
    expect(out).toEqual({ action: "apply", fields: { gender: "male" }, conflicts: ["phone"] });
  });

  it("never loses the other device's field", () => {
    // device A already wrote `phone` (version 7); device B edits `lastName` from an
    // older base — both survive, nothing is silently dropped
    const out = mergeFieldLww(server, mut({ lastName: "موسوی" }, 5));
    expect(out.action).toBe("apply");
    if (out.action === "apply") {
      expect(out.fields).toEqual({ lastName: "موسوی" });
      expect(out.conflicts).toEqual([]);
    }
  });

  it("a device clock cannot win or lose anything any more", () => {
    const ancient = { ...mut({ gender: "male" }, 7), clientUpdatedAt: "1999-01-01T00:00:00Z" };
    const future = { ...mut({ gender: "male" }, 7), clientUpdatedAt: "2099-01-01T00:00:00Z" };
    expect(mergeFieldLww(server, ancient)).toEqual(mergeFieldLww(server, future));
  });

  it("rejects a missing or impossible base version", () => {
    expect(mergeFieldLww(server, mut({ gender: "male" }, null))).toEqual({
      action: "rejected",
      reason: "missing-base-version",
    });
    expect(mergeFieldLww(server, mut({ gender: "male" }, 99))).toEqual({
      action: "rejected",
      reason: "unknown-base-version",
    });
  });

  it("refuses to merge an append-only entity", () => {
    expect(() => mergeFieldLww(server, { ...mut({}, 1), entity: "analyses" })).toThrow();
  });
});

describe("commit-safe cursor (H5)", () => {
  it("round-trips, defaults to zero and rejects garbage", () => {
    expect(decodeCursor(CURSOR_ZERO)).toEqual({ xid: "0", seq: 0 });
    expect(decodeCursor("")).toEqual({ xid: "0", seq: 0 });
    expect(decodeCursor(null)).toEqual({ xid: "0", seq: 0 });
    expect(encodeCursor({ xid: "911", seq: 42 })).toBe("911:42");
    expect(decodeCursor("911:42")).toEqual({ xid: "911", seq: 42 });
    expect(decodeCursor("nope")).toBeNull();
    expect(decodeCursor("1:2:3")).toBeNull();
    expect(decodeCursor("-1:2")).toBeNull();
  });

  it("orders by transaction id first, sequence second", () => {
    expect(isCursorAhead({ xid: "10", seq: 1 }, { xid: "9", seq: 999 })).toBe(true);
    expect(isCursorAhead({ xid: "10", seq: 1 }, { xid: "10", seq: 2 })).toBe(false);
    expect(isCursorAhead({ xid: "10", seq: 3 }, { xid: "10", seq: 2 })).toBe(true);
  });
});

describe("outbox", () => {
  it("dedupes ids across a restore", async () => {
    const ob = new Outbox();
    const m = await ob.enqueue("patients", "create", patient());
    const restored = new Outbox();
    restored.restore(ob.snapshot());
    expect(restored.size).toBe(1);
    expect(restored.snapshot()[0]!.envelope.clientMutationId).toBe(m.clientMutationId);
  });

  it("batches oldest-first and acks pushed ids", async () => {
    const ob = new Outbox();
    await ob.enqueue("patients", "create", patient());
    await ob.enqueue("analyses", "create", {});
    await ob.enqueue("treatment_plans", "update", { id: "x" }, 4);
    const batch = ob.takeBatch(2);
    expect(batch).toHaveLength(2);
    await ob.ack(batch.map((m) => m.clientMutationId));
    expect(ob.size).toBe(1);
    expect(ob.takeBatch(1)[0]!.entity).toBe("treatment_plans");
  });

  it("refuses to queue an envelope the server would reject", async () => {
    const ob = new Outbox();
    await expect(ob.enqueue("patients", "update", { id: "x" })).rejects.toThrow(MutationContractError);
    expect(ob.size).toBe(0);
  });

  it("orders smalls before media in priority", () => {
    expect(outboxPriority(makeMutation("analyses", "create", {}))).toBeGreaterThan(
      outboxPriority(makeMutation("patients", "update", {}, 1)),
    );
  });
});

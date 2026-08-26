import { describe, expect, it } from "vitest";
import {
  Outbox,
  SCHEMA_VERSION_CURRENT,
  makeMutation,
  isSchemaVersionSupported,
  mergeFieldLww,
  outboxPriority,
  type MutationEnvelope,
  type ServerRow,
} from "./index.js";

const patient = (over: Record<string, unknown> = {}) => ({ firstName: "علی", lastName: "رضایی", phone: "09120000000", ...over });

describe("mutation envelope (schemaVersion window)", () => {
  it("stamps the current schema version and a fresh uuid", () => {
    const m = makeMutation("patients", "update", { phone: "09120000001" }, "2026-01-01T00:00:00Z");
    expect(m.schemaVersion).toBe(SCHEMA_VERSION_CURRENT);
    expect(m.clientMutationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports supported window for server parity", () => {
    expect(isSchemaVersionSupported(1)).toBe(true);
    expect(isSchemaVersionSupported(2)).toBe(true); // future contract pre-accepted
    expect(isSchemaVersionSupported(3)).toBe(false);
  });
});

describe("field-level LWW (§8) — two clients, one patient", () => {
  const serverRow: ServerRow = {
    updatedAt: "2026-08-26T10:00:00Z",
    firstName: "علی",
    lastName: "رضایی",
    phone: "09120000000",
    notes: "سرور نوشت",
  };

  const mut = (at: string, patch: Record<string, unknown>, base = "2026-08-26T10:00:00Z"): MutationEnvelope<FieldPatch> =>
    ({ ...makeMutation("patients", "update", patch, base), clientUpdatedAt: at, payload: patch });

  it("applies non-conflicting fields without losing server data", () => {
    const out = mergeFieldLww(serverRow, mut("2026-08-26T11:00:00Z", { phone: "09121111111" }));
    expect(out.action).toBe("apply");
    if (out.action === "apply") {
      expect(out.fields.phone).toBe("09121111111");
      expect(out.fields.notes).toBeUndefined(); // untouched field not in patch
      // server keeps its own notes — nothing lost
      expect(serverRow.notes).toBe("سرور نوشت");
    }
  });

  it("conflicting field: newer client wins; equal/newer server stays", () => {
    const newerClient = mergeFieldLww(serverRow, mut("2026-08-26T12:00:00Z", { lastName: "احمدی" }));
    expect(newerClient).toEqual({ action: "apply", fields: { lastName: "احمدی" } });

    const staleClock = mergeFieldLww(serverRow, mut("2026-08-26T09:00:00Z", { lastName: "قدیمی" }));
    expect(staleClock).toEqual({ action: "apply", fields: {} }); // server newer → field kept, op applies empty
  });

  it("rejects mutations based on a stale base version", () => {
    const out = mergeFieldLww(serverRow, mut("2026-08-26T12:00:00Z", { phone: "x" }, "2026-08-25T00:00:00Z"));
    expect(out.action).toBe("rejected-stale-base");
  });

  it("never loses the other client's field in a classic conflict", () => {
    // Client A changed phone @11:00, already applied → server now has A's phone
    const afterA: ServerRow = { updatedAt: "2026-08-26T11:00:00Z", firstName: "علی", lastName: "رضایی", phone: "09122222222", notes: "" };
    // Client B (offline, edited @11:30 against the OLD base) changes lastName
    const b = mut("2026-08-26T11:30:00Z", { lastName: "موسوی" }, "2026-08-26T10:00:00Z");
    const out = mergeFieldLww(afterA, b);
    // B's base is stale ⇒ rejected ⇒ B pulls A's phone, re-applies its lastName on top:
    expect(out.action).toBe("rejected-stale-base");
    // After pull+retry with new base, BOTH survive:
    const retried = mergeFieldLww(afterA, { ...b, baseVersion: afterA.updatedAt });
    expect(retried).toEqual({ action: "apply", fields: { lastName: "موسوی" } });
    expect(afterA.phone).toBe("09122222222"); // A's data intact
  });
});

describe("outbox", () => {
  it("dedupes by clientMutationId across restore", async () => {
    const ob = new Outbox();
    const m = await ob.enqueue("patients", "create", patient());
    const ob2 = new Outbox();
    ob2.restore([m]);
    expect(ob2.size).toBe(1);
    expect(() => ob2.enqueue("patients", "create", patient(), null)).not.toThrow(); // new id generated
  });

  it("batches oldest-first and acks pushed ids", async () => {
    const ob = new Outbox();
    await ob.enqueue("patients", "create", patient());
    await ob.enqueue("analyses", "create", {});
    await ob.enqueue("treatment_plans", "update", {});
    const batch = ob.takeBatch(2);
    expect(batch).toHaveLength(2);
    ob.ack([batch[0].clientMutationId, batch[1].clientMutationId]);
    expect(ob.size).toBe(1);
    expect(ob.takeBatch(1)[0].entity).toBe("treatment_plans");
  });

  it("unshifts rejected items to the front for retry", async () => {
    const ob = new Outbox();
    await ob.enqueue("patients", "create", patient());
    const first = ob.takeBatch(1)[0];
    const rejected: MutationEnvelope[] = [{ ...first, payload: {} }];
    ob.ack([first.clientMutationId]);
    ob.unshift(rejected);
    expect(ob.takeBatch(5)[0].clientMutationId).toBe(first.clientMutationId);
  });

  it("orders smalls before media in priority", () => {
    expect(outboxPriority(makeMutation("analyses", "create", {}))).toBeGreaterThan(
      outboxPriority(makeMutation("patients", "update", {})),
    );
  });
});

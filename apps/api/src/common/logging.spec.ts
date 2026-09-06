import { describe, expect, it } from "vitest";
import { ALLOWED_LOG_KEYS, buildLogLine, resolveRequestId } from "./logging.js";

describe("structured logging (L3)", () => {
  it("keeps allowlisted metadata and drops everything else", () => {
    const line = buildLogLine("info", {
      event: "patient.notes_set",
      requestId: "abcd1234efgh",
      clinicId: "c1",
      fields: ["notes"],
      body: { notes: "خارش شدید ناحیه فرونتال" },
      query: "q=علی",
      headers: { authorization: "Bearer abcdefghijkl" },
    });

    expect(line).toMatchObject({
      level: "info",
      event: "patient.notes_set",
      requestId: "abcd1234efgh",
      clinicId: "c1",
      fields: ["notes"],
    });
    expect(line).not.toHaveProperty("body");
    expect(line).not.toHaveProperty("query");
    expect(line).not.toHaveProperty("headers");
    expect(JSON.stringify(line)).not.toContain("خارش");
  });

  it("scrubs PHI out of an allowlisted value too", () => {
    const line = buildLogLine("error", {
      event: "db.error",
      // A Postgres unique-violation message quotes the conflicting value.
      message: 'duplicate key value violates unique constraint: Key (phone)=(09123456789) already exists',
    });
    expect(String(line.message)).toContain("[phone-redacted]");
    expect(String(line.message)).not.toContain("09123456789");
  });

  it("never lets a log line grow without bound", () => {
    const line = buildLogLine("warn", { event: "x", message: "ا".repeat(5000) });
    expect(String(line.message).length).toBeLessThanOrEqual(201);
  });

  it("only trusts a caller-supplied request id that looks like one", () => {
    expect(resolveRequestId("req-0123456789")).toBe("req-0123456789");
    expect(resolveRequestId("short")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("../../etc/passwd")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not allowlist any request-body-ish key", () => {
    for (const forbidden of ["body", "payload", "params", "query", "headers", "notes", "email", "phone"]) {
      expect(ALLOWED_LOG_KEYS.has(forbidden)).toBe(false);
    }
  });
});

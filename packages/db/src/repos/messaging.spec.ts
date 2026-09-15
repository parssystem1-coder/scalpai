/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { MessagingError, bodyDigest, recipientDigest } from "./messaging.repo.js";

describe("MessagingError", () => {
  it("has name MessagingError", () => {
    expect(new MessagingError("x").name).toBe("MessagingError");
  });
});

describe("recipientDigest", () => {
  it("returns sha256 hex digest", () => {
    const result = recipientDigest("09121234567");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
  it("normalizes whitespace", () => {
    const a = recipientDigest("  09121234567  ");
    const b = recipientDigest("09121234567");
    expect(a).toBe(b);
  });
  it("throws on empty string", () => {
    expect(() => recipientDigest("")).toThrow(MessagingError);
  });
  it("throws on whitespace-only string", () => {
    expect(() => recipientDigest("   ")).toThrow(MessagingError);
  });
  it("produces deterministic output", () => {
    const a = recipientDigest("09121234567");
    const b = recipientDigest("09121234567");
    expect(a).toBe(b);
  });
  it("produces different hashes for different inputs", () => {
    const a = recipientDigest("09121234567");
    const b = recipientDigest("09127654321");
    expect(a).not.toBe(b);
  });
});

describe("bodyDigest", () => {
  it("returns sha256 hex digest", () => {
    const result = bodyDigest("hello world");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
  it("produces deterministic output", () => {
    const a = bodyDigest("test body");
    const b = bodyDigest("test body");
    expect(a).toBe(b);
  });
  it("produces different digests for different bodies", () => {
    const a = bodyDigest("body one");
    const b = bodyDigest("body two");
    expect(a).not.toBe(b);
  });
  it("handles empty string", () => {
    const result = bodyDigest("");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
  it("handles unicode", () => {
    const result = bodyDigest("سلام دنیا");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

function mockTx(rows: unknown[] = []) {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(rows),
            }),
          }),
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue({ rows: [] }),
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  } as any;
}

describe("messaging DB functions (smoke)", () => {
  it("enqueueMessage returns duplicate: true for conflict", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const onConflictFn = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "m1", state: "queued" }]),
          }),
        }),
      }),
    } as any;
    const { enqueueMessage } = await import("./messaging.repo.js");
    const result = await enqueueMessage(tx as any, "c1", {
      channel: "kavenegar",
      templateKey: "t1",
      locale: "fa",
      recipient: "09121234567",
      body: "test",
      varsRedacted: {},
      idempotencyKey: "key1",
    });
    expect(result.duplicate).toBe(true);
    expect(result.id).toBe("m1");
  });

  it("listMessages returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listMessages } = await import("./messaging.repo.js");
    const result = await listMessages(tx as any, "c1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listInbox returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listInbox } = await import("./messaging.repo.js");
    const result = await listInbox(tx as any, "c1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("isOptedOut returns false for no match", async () => {
    const tx = mockTx([]);
    const { isOptedOut } = await import("./messaging.repo.js");
    const result = await isOptedOut(tx as any, "c1", "09121234567");
    expect(result).toBe(false);
  });

  it("readInboundBody returns null for no match", async () => {
    const tx = mockTx([]);
    const { readInboundBody } = await import("./messaging.repo.js");
    const result = await readInboundBody(tx as any, "c1", "nonexistent");
    expect(result).toBeNull();
  });

  it("markMessageSent returns false for no match", async () => {
    const tx = mockTx([]);
    const { markMessageSent } = await import("./messaging.repo.js");
    const result = await markMessageSent(tx as any, "c1", "nonexistent", "provider");
    expect(result).toBe(false);
  });

  it("markMessageFailed returns false for no match", async () => {
    const tx = mockTx([]);
    const { markMessageFailed } = await import("./messaging.repo.js");
    const result = await markMessageFailed(tx as any, "c1", "nonexistent", "reason");
    expect(result).toBe(false);
  });

  it("markMessageSuppressed returns false for no match", async () => {
    const tx = mockTx([]);
    const { markMessageSuppressed } = await import("./messaging.repo.js");
    const result = await markMessageSuppressed(tx as any, "c1", "nonexistent", "reason");
    expect(result).toBe(false);
  });
});

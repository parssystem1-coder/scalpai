/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  PaymentAttemptError,
  PAYMENT_ATTEMPT_TTL_MS,
  claimPaymentAttempt,
  createPendingAttempt,
  expireStalePaymentAttempts,
  findActiveAttemptByInvoice,
  findAttemptByAuthority,
  resolvePaymentAttemptClinic,
  transitionToCallbackReceived,
  transitionToFailed,
  transitionToStarted,
} from "./payment-attempts.repo.js";

function txMock(options: { selectRows?: unknown[]; executeRows?: unknown[]; updateRows?: unknown[]; insertRows?: unknown[] } = {}) {
  const selectRows = options.selectRows ?? [];
  const executeRows = [...(options.executeRows ?? [])];
  const updateRows = options.updateRows ?? [];
  const insertRows = options.insertRows ?? [];
  const chain = (rows: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    select: vi.fn(() => chain(selectRows)),
    execute: vi.fn().mockImplementation(async () => executeRows.shift() ?? { rows: [] }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(insertRows) })),
        returning: vi.fn().mockResolvedValue(insertRows),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(updateRows) })),
      })),
    })),
  } as any;
}

describe("payment-attempts repository", () => {
  it("rejects empty authorities without querying", async () => {
    const tx = txMock();
    await expect(findAttemptByAuthority(tx, "clinic-1", "  ")).resolves.toBeNull();
    await expect(resolvePaymentAttemptClinic(tx, "")).resolves.toBeNull();
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("reads attempts and resolves callback clinic identity", async () => {
    const row = { id: "a1", authority: "AUTH-1" };
    const tx = txMock({ selectRows: [row], executeRows: [{ rows: [{ clinic_id: "clinic-1" }] }] });
    await expect(findAttemptByAuthority(tx, "clinic-1", "AUTH-1")).resolves.toEqual(row);
    await expect(findActiveAttemptByInvoice(tx, "clinic-1", "invoice-1")).resolves.toEqual(row);
    await expect(resolvePaymentAttemptClinic(tx, "AUTH-1")).resolves.toBe("clinic-1");
  });

  it("validates amount and creates a pending attempt with an audit record", async () => {
    const tx = txMock({ insertRows: [{ id: "a1", provider: "zarinpal", invoiceId: "i1" }] });
    await expect(createPendingAttempt(tx, "clinic-1", null, { invoiceId: "i1", amount: 0 })).rejects.toThrow(PaymentAttemptError);
    await expect(createPendingAttempt(tx, "clinic-1", null, { invoiceId: "i1", amount: 125000, ttlMs: PAYMENT_ATTEMPT_TTL_MS })).resolves.toMatchObject({ id: "a1" });
    expect(tx.insert).toHaveBeenCalled();
  });

  it("returns missing, paid, unpayable and no-amount claim outcomes", async () => {
    await expect(claimPaymentAttempt(txMock({ executeRows: [{ rows: [] }] }), "c1", null, { invoiceId: "i1" })).resolves.toEqual({ outcome: "missing" });
    await expect(claimPaymentAttempt(txMock({ selectRows: [{ state: "paid" }] }), "c1", null, { invoiceId: "i1" })).resolves.toEqual({ outcome: "paid" });
    await expect(claimPaymentAttempt(txMock({ selectRows: [{ state: "draft" }] }), "c1", null, { invoiceId: "i1" })).resolves.toEqual({ outcome: "unpayable", state: "draft" });
    await expect(claimPaymentAttempt(txMock({ selectRows: [{ state: "issued", total: "100", paidAmount: "100" }] }), "c1", null, { invoiceId: "i1" })).resolves.toEqual({ outcome: "no_amount" });
  });

  it("enforces transition inputs and returns compare-and-set results", async () => {
    const tx = txMock({ updateRows: [{ id: "a1", status: "started" }] });
    await expect(transitionToStarted(tx, "c1", "a1", " ", "redirect")).rejects.toThrow(PaymentAttemptError);
    await expect(transitionToStarted(tx, "c1", "a1", "AUTH-1", "redirect")).resolves.toMatchObject({ status: "started" });
    await expect(transitionToCallbackReceived(tx, "c1", "a1")).resolves.toMatchObject({ status: "started" });
    await expect(transitionToFailed(tx, "c1", null, "a1", "provider-error")).resolves.toMatchObject({ id: "a1" });
  });

  it("expires stale attempts through the database update", async () => {
    const tx = txMock({ updateRows: [{ id: "a1", status: "expired" }] });
    await expect(expireStalePaymentAttempts(tx, "clinic-1")).resolves.toEqual([{ id: "a1", status: "expired" }]);
    expect(tx.update).toHaveBeenCalledOnce();
  });
});

// Keep the exported error contract explicit for callers that classify failures.
it("exposes a stable payment attempt error name", () => {
  expect(new PaymentAttemptError("x").name).toBe("PaymentAttemptError");
});

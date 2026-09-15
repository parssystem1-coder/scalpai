/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { BillingError } from "./billing.repo.js";

describe("BillingError", () => {
  it("has name BillingError", () => {
    expect(new BillingError("x").name).toBe("BillingError");
  });
  it("carries message", () => {
    expect(new BillingError("oops").message).toBe("oops");
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

describe("billing DB functions (smoke)", () => {
  it("listProducts returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listProducts } = await import("./billing.repo.js");
    const result = await listProducts(tx as any, "c1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("getProduct returns null for no rows", async () => {
    const tx = mockTx([]);
    const { getProduct } = await import("./billing.repo.js");
    const result = await getProduct(tx as any, "c1", "nonexistent");
    expect(result).toBeNull();
  });

  it("listInvoices returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listInvoices } = await import("./billing.repo.js");
    const result = await listInvoices(tx as any, "c1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("getInvoice returns null for no rows", async () => {
    const tx = mockTx([]);
    const { getInvoice } = await import("./billing.repo.js");
    const result = await getInvoice(tx as any, "c1", "nonexistent");
    expect(result).toBeNull();
  });

  it("createProduct calls insert", async () => {
    const tx = mockTx([{ id: "p1", sku: "SVC-001" }]);
    const { createProduct } = await import("./billing.repo.js");
    const result = await createProduct(tx as any, "c1", "user1", {
      sku: "SVC-001",
      name: "Consultation",
      kind: "service",
      unit: "session",
      price: 500000,
      currency: "IRR",
      taxRate: 0.09,
      active: true,
    });
    expect(tx.insert).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("softDeleteInvoice returns false for no match", async () => {
    const tx = mockTx([]);
    const { softDeleteInvoice } = await import("./billing.repo.js");
    const result = await softDeleteInvoice(tx as any, "c1", "nonexistent");
    expect(result).toBe(false);
  });

  it("softDeleteProduct returns false for no match", async () => {
    const tx = mockTx([]);
    const { softDeleteProduct } = await import("./billing.repo.js");
    const result = await softDeleteProduct(tx as any, "c1", "nonexistent");
    expect(result).toBe(false);
  });
});

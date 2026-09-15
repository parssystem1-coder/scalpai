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

  it("updateProduct returns null for no match", async () => {
    const tx = mockTx([]);
    const { updateProduct } = await import("./billing.repo.js");
    const result = await updateProduct(tx as any, "c1", "nonexistent", { name: "New" });
    expect(result).toBeNull();
  });

  it("updateProduct with empty patch returns existing row", async () => {
    const existing = { id: "p1", name: "Old", sku: "SVC-001" };
    const tx = mockTx([existing]);
    const { updateProduct } = await import("./billing.repo.js");
    const result = await updateProduct(tx as any, "c1", "p1", {});
    expect(result).toBeDefined();
  });

  it("softDeleteProduct returns true when matched", async () => {
    const tx = mockTx([{ id: "p1" }]);
    const { softDeleteProduct } = await import("./billing.repo.js");
    const result = await softDeleteProduct(tx as any, "c1", "p1");
    expect(result).toBe(true);
  });

  it("softDeleteInvoice throws for non-draft non-void invoice", async () => {
    const tx = mockTx([{ id: "i1", state: "issued", items: [], paidAmount: "0" }]);
    const { softDeleteInvoice } = await import("./billing.repo.js");
    await expect(softDeleteInvoice(tx as any, "c1", "i1")).rejects.toThrow(BillingError);
  });

  it("issueInvoice returns null for no match", async () => {
    const tx = mockTx([]);
    const { issueInvoice } = await import("./billing.repo.js");
    const result = await issueInvoice(tx as any, "c1", "nonexistent");
    expect(result).toBeNull();
  });

  it("issueInvoice throws for non-draft invoice", async () => {
    const tx = mockTx([{ id: "i1", state: "issued", number: "INV-001", items: [{}], paidAmount: "0" }]);
    const { issueInvoice } = await import("./billing.repo.js");
    await expect(issueInvoice(tx as any, "c1", "i1")).rejects.toThrow(BillingError);
  });

  it("voidInvoice returns null for no match", async () => {
    const tx = mockTx([]);
    const { voidInvoice } = await import("./billing.repo.js");
    const result = await voidInvoice(tx as any, "c1", "nonexistent", "reason");
    expect(result).toBeNull();
  });

  it("voidInvoice throws for invoice with payments", async () => {
    const tx = mockTx([{ id: "i1", state: "issued", number: "INV-001", items: [{}], paidAmount: "1000" }]);
    const { voidInvoice } = await import("./billing.repo.js");
    await expect(voidInvoice(tx as any, "c1", "i1", "reason")).rejects.toThrow(BillingError);
  });

  it("payInvoice throws for non-positive amount", async () => {
    const tx = mockTx([]);
    const { payInvoice } = await import("./billing.repo.js");
    await expect(payInvoice(tx as any, "c1", "i1", { amount: 0, method: "cash" })).rejects.toThrow(BillingError);
    await expect(payInvoice(tx as any, "c1", "i1", { amount: -100, method: "cash" })).rejects.toThrow(BillingError);
  });

  it("payInvoice returns null for no match", async () => {
    const tx = mockTx([]);
    tx.execute.mockResolvedValueOnce({ rows: [] });
    const { payInvoice } = await import("./billing.repo.js");
    const result = await payInvoice(tx as any, "c1", "i1", { amount: 1000, method: "cash" });
    expect(result).toBeNull();
  });

  it("payInvoice throws for draft invoice", async () => {
    const tx = mockTx([]);
    tx.execute.mockResolvedValueOnce({ rows: [{ number: "INV-001", state: "draft", total: "10000", paid_amount: "0" }] });
    const { payInvoice } = await import("./billing.repo.js");
    await expect(payInvoice(tx as any, "c1", "i1", { amount: 1000, method: "cash" })).rejects.toThrow(BillingError);
  });

  it("payInvoice throws for void invoice", async () => {
    const tx = mockTx([]);
    tx.execute.mockResolvedValueOnce({ rows: [{ number: "INV-001", state: "void", total: "10000", paid_amount: "0" }] });
    const { payInvoice } = await import("./billing.repo.js");
    await expect(payInvoice(tx as any, "c1", "i1", { amount: 1000, method: "cash" })).rejects.toThrow(BillingError);
  });

  it("payInvoice throws when amount exceeds outstanding", async () => {
    const tx = mockTx([]);
    tx.execute.mockResolvedValueOnce({ rows: [{ number: "INV-001", state: "issued", total: "10000", paid_amount: "9000" }] });
    const { payInvoice } = await import("./billing.repo.js");
    await expect(payInvoice(tx as any, "c1", "i1", { amount: 2000, method: "cash" })).rejects.toThrow(BillingError);
  });

  it("replaceInvoiceItems returns null for no match", async () => {
    const tx = mockTx([]);
    const { replaceInvoiceItems } = await import("./billing.repo.js");
    const result = await replaceInvoiceItems(tx as any, "c1", "nonexistent", []);
    expect(result).toBeNull();
  });

  it("replaceInvoiceItems throws for non-draft invoice", async () => {
    const tx = mockTx([{ id: "i1", state: "issued", number: "INV-001", items: [{}], paidAmount: "0" }]);
    const { replaceInvoiceItems } = await import("./billing.repo.js");
    await expect(replaceInvoiceItems(tx as any, "c1", "i1", [])).rejects.toThrow(BillingError);
  });

  it("listProducts with kind filter", async () => {
    const tx = mockTx([]);
    const { listProducts } = await import("./billing.repo.js");
    const result = await listProducts(tx as any, "c1", { kind: "service", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listProducts with active filter", async () => {
    const tx = mockTx([]);
    const { listProducts } = await import("./billing.repo.js");
    const result = await listProducts(tx as any, "c1", { active: true, limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listInvoices with patientId filter", async () => {
    const tx = mockTx([]);
    const { listInvoices } = await import("./billing.repo.js");
    const result = await listInvoices(tx as any, "c1", { patientId: "p1", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listInvoices with state filter", async () => {
    const tx = mockTx([]);
    const { listInvoices } = await import("./billing.repo.js");
    const result = await listInvoices(tx as any, "c1", { state: "issued", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listInvoices with date range", async () => {
    const tx = mockTx([]);
    const { listInvoices } = await import("./billing.repo.js");
    const result = await listInvoices(tx as any, "c1", { from: new Date("2026-01-01"), to: new Date("2026-12-31"), limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("voidInvoice returns existing if already void", async () => {
    const existing = { id: "i1", state: "void", number: "INV-001", items: [], paidAmount: "0" };
    const tx = mockTx([existing]);
    const { voidInvoice } = await import("./billing.repo.js");
    const result = await voidInvoice(tx as any, "c1", "i1", "reason");
    expect(result).toBeDefined();
  });

  it("softDeleteInvoice succeeds for draft invoice", async () => {
    const tx = mockTx([{ id: "i1", state: "draft", number: "INV-001", items: [{}], paidAmount: "0" }]);
    const { softDeleteInvoice } = await import("./billing.repo.js");
    const result = await softDeleteInvoice(tx as any, "c1", "i1");
    expect(result).toBe(true);
  });

  it("softDeleteInvoice succeeds for void invoice", async () => {
    const tx = mockTx([{ id: "i1", state: "void", number: "INV-001", items: [{}], paidAmount: "0" }]);
    const { softDeleteInvoice } = await import("./billing.repo.js");
    const result = await softDeleteInvoice(tx as any, "c1", "i1");
    expect(result).toBe(true);
  });
});

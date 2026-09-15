import { Injectable } from "@nestjs/common";
import {
  createInvoice,
  createProduct,
  getInvoice,
  getProduct,
  issueInvoice,
  listInvoices,
  listProducts,
  payInvoice,
  replaceInvoiceItems,
  softDeleteInvoice,
  softDeleteProduct,
  updateProduct,
  voidInvoice,
  type InvoiceCreateRecord,
  type InvoiceFilter,
  type InvoiceItemRecord,
  type PaymentRecord,
  type ProductCreateRecord,
  type ProductFilter,
  type ProductPatch,
} from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";

/**
 * لایه ریپوزیتوری صورتحساب (فاز ۵a / ADR-0046).
 *
 * تنها مرز تراکنش این مادول. هر متد از `TenantScope.tx` می‌گذرد، پس هر کوئری
 * قطعاً clinicId دارد و RLS لایه‌ی دوم می‌ماند نه تنها لایه.
 *
 * توجه: ساخت فاکتور یک تراکنش است و نه چندتا — شماره، ردیف، سطرها و
 * بازمحاسبه مبالغ باید با هم commit شوند. یک فاکتور بدون سطر و با مبلغ صفر،
 * دقیقاً چیزی است که بعداً کسی باید دستی توضیح دهد.
 */
@Injectable()
export class BillingRepository {
  constructor(private scope: TenantScope) {}

  /* ── products ── */

  listProducts(filter: ProductFilter) {
    return this.scope.tx((tx, ctx) => listProducts(tx, ctx.clinicId, filter));
  }

  getProduct(id: string) {
    return this.scope.tx((tx, ctx) => getProduct(tx, ctx.clinicId, id));
  }

  createProduct(input: ProductCreateRecord) {
    return this.scope.tx((tx, ctx) => createProduct(tx, ctx.clinicId, ctx.userId, input));
  }

  updateProduct(id: string, patch: ProductPatch) {
    return this.scope.tx((tx, ctx) => updateProduct(tx, ctx.clinicId, id, patch));
  }

  deleteProduct(id: string) {
    return this.scope.tx((tx, ctx) => softDeleteProduct(tx, ctx.clinicId, id));
  }

  /* ── invoices ── */

  listInvoices(filter: InvoiceFilter) {
    return this.scope.tx((tx, ctx) => listInvoices(tx, ctx.clinicId, filter));
  }

  getInvoice(id: string) {
    return this.scope.tx((tx, ctx) => getInvoice(tx, ctx.clinicId, id));
  }

  createInvoice(input: InvoiceCreateRecord) {
    return this.scope.tx((tx, ctx) => createInvoice(tx, ctx.clinicId, ctx.userId, input));
  }

  replaceItems(id: string, items: readonly InvoiceItemRecord[]) {
    return this.scope.tx((tx, ctx) => replaceInvoiceItems(tx, ctx.clinicId, id, items));
  }

  issueInvoice(id: string) {
    return this.scope.tx((tx, ctx) => issueInvoice(tx, ctx.clinicId, id));
  }

  payInvoice(id: string, payment: PaymentRecord) {
    return this.scope.tx((tx, ctx) => payInvoice(tx, ctx.clinicId, id, payment));
  }

  voidInvoice(id: string, reason: string) {
    return this.scope.tx((tx, ctx) => voidInvoice(tx, ctx.clinicId, id, reason));
  }

  deleteInvoice(id: string) {
    return this.scope.tx((tx, ctx) => softDeleteInvoice(tx, ctx.clinicId, id));
  }
}

import { Injectable } from "@nestjs/common";
import {
  errors,
  type InvoiceCreateDto,
  type InvoiceItemInputDto,
  type InvoiceItemsReplaceDto,
  type InvoicePaymentDto,
  type InvoiceQueryDto,
  type ProductCreateDto,
  type ProductQueryDto,
  type ProductUpdateDto,
} from "@scalpai/shared";
import { BillingError, type InvoiceItemRecord } from "@scalpai/db";
import { BillingRepository } from "./billing.repository.js";

/**
 * صورتحساب و کاتالوگ (فاز ۵a / ADR-0046).
 *
 * این لایه دو کار می‌کند و بیشتر نه:
 *
 *   ۱) مپ کردن DTO به رکورد ریپو.
 *   ۲) ترجمه‌ی `BillingError` به کد HTTP درست.
 *
 * مورد دوم مهم‌تر از آن است که به نظر می‌رسد: «فاکتور پرداخت‌شده را
 * نمی‌توان باطل کرد» یک قاعده‌ی کاری است نه خرابی سرور؛ فرستادن ۵۰۰ به جای
 * ۴۰۹، منشی را مجبور می‌کند به پشتیبانی زنگ بزند تا بفهمد کارش اشتباه بوده.
 */
@Injectable()
export class BillingService {
  constructor(private repo: BillingRepository) {}

  /** قاعده‌ی کاری → ۴۰۹، نه ۵۰۰. */
  private static rethrow(err: unknown): never {
    if (err instanceof BillingError) throw errors.conflict(err.message);
    throw err;
  }

  /* ══ products ═════════════════════════════════════════════════ */

  listProducts(q: ProductQueryDto) {
    return this.repo.listProducts({
      kind: q.kind,
      active: q.active === undefined ? undefined : q.active === "true",
      limit: q.limit,
      offset: q.offset,
    });
  }

  async getProduct(id: string) {
    const product = await this.repo.getProduct(id);
    if (!product) throw errors.notFound();
    return product;
  }

  /**
   * ساخت محصول. برخورد یکتایی sku در دیتابیس به ۴۰۹ ترجمه می‌شود، و
   * پیامش می‌گوید کدام sku — چون یکتایی جزئی است و یک sku می‌تواند روی یک
   * ردیف حذف‌شده باشد و باز هم قابل استفاده بماند.
   */
  async createProduct(dto: ProductCreateDto) {
    try {
      return await this.repo.createProduct({
        sku: dto.sku,
        name: dto.name,
        kind: dto.kind,
        serviceId: dto.serviceId,
        unit: dto.unit,
        price: dto.price,
        currency: dto.currency,
        taxRate: dto.taxRate,
        active: dto.active,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw errors.conflict(`sku تکراری است: ${dto.sku}`);
      return BillingService.rethrow(err);
    }
  }

  async updateProduct(id: string, dto: ProductUpdateDto) {
    const updated = await this.repo.updateProduct(id, {
      name: dto.name,
      kind: dto.kind,
      serviceId: dto.serviceId,
      unit: dto.unit,
      price: dto.price,
      taxRate: dto.taxRate,
      active: dto.active,
    });
    if (!updated) throw errors.notFound();
    return updated;
  }

  async deleteProduct(id: string) {
    const ok = await this.repo.deleteProduct(id);
    if (!ok) throw errors.notFound();
    return { deleted: true as const };
  }

  /* ══ invoices ═════════════════════════════════════════════════ */

  listInvoices(q: InvoiceQueryDto) {
    return this.repo.listInvoices({
      patientId: q.patientId,
      state: q.state,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
      offset: q.offset,
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.repo.getInvoice(id);
    if (!invoice) throw errors.notFound();
    return invoice;
  }

  async createInvoice(dto: InvoiceCreateDto) {
    try {
      const invoice = await this.repo.createInvoice({
        patientId: dto.patientId,
        sessionId: dto.sessionId,
        currency: dto.currency,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        items: dto.items.map(toItemRecord),
      });
      if (!invoice) throw errors.notFound();
      return invoice;
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }

  async replaceItems(id: string, dto: InvoiceItemsReplaceDto) {
    try {
      const invoice = await this.repo.replaceItems(id, dto.items.map(toItemRecord));
      if (!invoice) throw errors.notFound();
      return invoice;
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }

  async issue(id: string) {
    try {
      const invoice = await this.repo.issueInvoice(id);
      if (!invoice) throw errors.notFound();
      return invoice;
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }

  async pay(id: string, dto: InvoicePaymentDto) {
    try {
      const invoice = await this.repo.payInvoice(id, {
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      });
      if (!invoice) throw errors.notFound();
      return invoice;
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }

  async voidInvoice(id: string, reason: string) {
    try {
      const invoice = await this.repo.voidInvoice(id, reason);
      if (!invoice) throw errors.notFound();
      return invoice;
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }

  async deleteInvoice(id: string) {
    try {
      const ok = await this.repo.deleteInvoice(id);
      if (!ok) throw errors.notFound();
      return { deleted: true as const };
    } catch (err) {
      return BillingService.rethrow(err);
    }
  }
}

function toItemRecord(item: InvoiceItemInputDto): InvoiceItemRecord {
  return {
    productId: item.productId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    taxRate: item.taxRate,
  };
}

/** 23505 = unique_violation. تنها خطای pg که این لایه لازم است بشناسد. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

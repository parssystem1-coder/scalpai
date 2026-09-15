import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { invoiceItems, invoices, products } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * صورتحساب و کاتالوگ — لایه داده (فاز ۵a / ADR-0046).
 *
 * قاعده مرکزی: این فایل پول حساب نمی‌کند.
 *
 *   • شماره از `fn_invoice_next_number` می‌آید — زیر قفل advisory، بی‌حفره و
 *     بی‌تکرار. محاسبه‌اش در TS یعنی دو درخواست همزمان یک شماره می‌گیرند.
 *   • مبالغ از `fn_invoice_recalc` می‌آیند — تنها نویسنده‌ی subtotal/tax/total. هر
 *     مسیری که خودش جمع بزند، روزی با جمعِ سطرها اختلاف پیدا می‌کند.
 *   • line_total از تریگر BEFORE می‌آید.
 *
 * و یک قاعده دوم: اگر سطر productId دارد، قیمت و شرح از کاتالوگ کپی می‌شوند و
 * ادعای کلاینت دور ریخته می‌شود. وگرنه هر کاربری قیمت خودش را می‌نویسد. در
 * عوض مقدارِ کپی‌شده روی سطر می‌ماند: ویرایش امروزِ کاتالوگ نباید فاکتورِ
 * ماه قبل را عوض کند.
 */

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

/** numeric در درایور pg رشته برمی‌گردد. عدد کردنِ پول در مرز انجام می‌شود. */
function money(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/* ══ products ═════════════════════════════════════════════════════ */

const productColumns = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  kind: products.kind,
  serviceId: products.serviceId,
  unit: products.unit,
  price: products.price,
  currency: products.currency,
  taxRate: products.taxRate,
  active: products.active,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
} as const;

export interface ProductCreateRecord {
  sku: string;
  name: string;
  kind: string;
  serviceId?: string | undefined;
  unit: string;
  price: number;
  currency: string;
  taxRate: number;
  active: boolean;
}

export async function createProduct(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: ProductCreateRecord,
) {
  const rows = await tx
    .insert(products)
    .values({
      clinicId,
      sku: input.sku,
      name: input.name,
      kind: input.kind,
      serviceId: input.serviceId ?? null,
      unit: input.unit,
      price: String(input.price),
      currency: input.currency,
      taxRate: String(input.taxRate),
      active: input.active,
      createdBy: userId,
    })
    .returning(productColumns);
  const row = rows[0];
  if (!row) throw new BillingError("product insert returned no row");
  return row;
}

export interface ProductFilter {
  kind?: string | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
}

export async function listProducts(tx: Tx, clinicId: string, filter: ProductFilter) {
  const conditions = [eq(products.clinicId, clinicId), isNull(products.deletedAt)];
  if (filter.kind) conditions.push(eq(products.kind, filter.kind));
  if (filter.active !== undefined) conditions.push(eq(products.active, filter.active));
  return tx
    .select(productColumns)
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.sku))
    .limit(filter.limit)
    .offset(filter.offset);
}

export async function getProduct(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select(productColumns)
    .from(products)
    .where(and(eq(products.clinicId, clinicId), eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ProductPatch {
  name?: string | undefined;
  kind?: string | undefined;
  serviceId?: string | null | undefined;
  unit?: string | undefined;
  price?: number | undefined;
  taxRate?: number | undefined;
  active?: boolean | undefined;
}

export async function updateProduct(tx: Tx, clinicId: string, id: string, patch: ProductPatch) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.serviceId !== undefined) set.serviceId = patch.serviceId;
  if (patch.unit !== undefined) set.unit = patch.unit;
  if (patch.price !== undefined) set.price = String(patch.price);
  if (patch.taxRate !== undefined) set.taxRate = String(patch.taxRate);
  if (patch.active !== undefined) set.active = patch.active;
  if (Object.keys(set).length === 0) return getProduct(tx, clinicId, id);

  const rows = await tx
    .update(products)
    .set(set)
    .where(and(eq(products.clinicId, clinicId), eq(products.id, id), isNull(products.deletedAt)))
    .returning(productColumns);
  return rows[0] ?? null;
}

/** soft-delete. سطرهای فاکتورهای قدیم دست‌نخورده می‌مانند — مقدارشان کپی شده بود. */
export async function softDeleteProduct(tx: Tx, clinicId: string, id: string): Promise<boolean> {
  const rows = await tx
    .update(products)
    .set({ deletedAt: sql`now()`, active: false })
    .where(and(eq(products.clinicId, clinicId), eq(products.id, id), isNull(products.deletedAt)))
    .returning({ id: products.id });
  return rows.length > 0;
}

/* ══ invoices ════════════════════════════════════════════════════ */

const invoiceColumns = {
  id: invoices.id,
  patientId: invoices.patientId,
  sessionId: invoices.sessionId,
  number: invoices.number,
  state: invoices.state,
  currency: invoices.currency,
  subtotal: invoices.subtotal,
  discount: invoices.discount,
  tax: invoices.tax,
  total: invoices.total,
  paidAmount: invoices.paidAmount,
  paymentMethod: invoices.paymentMethod,
  paymentRef: invoices.paymentRef,
  issuedAt: invoices.issuedAt,
  dueAt: invoices.dueAt,
  paidAt: invoices.paidAt,
  voidedAt: invoices.voidedAt,
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
} as const;

const itemColumns = {
  id: invoiceItems.id,
  productId: invoiceItems.productId,
  description: invoiceItems.description,
  quantity: invoiceItems.quantity,
  unitPrice: invoiceItems.unitPrice,
  discount: invoiceItems.discount,
  taxRate: invoiceItems.taxRate,
  lineTotal: invoiceItems.lineTotal,
  position: invoiceItems.position,
} as const;

export interface InvoiceItemRecord {
  productId?: string | undefined;
  description?: string | undefined;
  quantity: number;
  unitPrice?: number | undefined;
  discount: number;
  taxRate?: number | undefined;
}

interface ResolvedItem {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}

/**
 * سطر ورودی → سطر قابل نوشتن.
 *
 * وجود productId یعنی قیمت، شرح و نرخ مالیات از کاتالوگ می‌آیند و هرچه کلاینت
 * فرستاده نادیده می‌ماند. تخفیف تنها چیزی است که کاربر تعیین می‌کند، چون
 * تخفیف دادن یک تصمیم انسانی است نه داده‌ی کاتالوگ.
 */
async function resolveItems(
  tx: Tx,
  clinicId: string,
  items: readonly InvoiceItemRecord[],
): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];

  // Collect all product IDs that need resolution
  const productIds = items
    .filter((item) => item.productId)
    .map((item) => item.productId!);

  // Batch-fetch all products at once (1 query instead of N)
  const productsMap = new Map<string, { id: string; name: string; price: string; taxRate: string }>();
  if (productIds.length > 0) {
    const rows = await tx
      .select(productColumns)
      .from(products)
      .where(
        and(
          eq(products.clinicId, clinicId),
          inArray(products.id, productIds),
          isNull(products.deletedAt),
        ),
      );

    for (const row of rows) {
      productsMap.set(row.id, row);
    }
  }

  // Resolve items using the map lookup (no N+1)
  for (const item of items) {
    if (item.productId) {
      const product = productsMap.get(item.productId);
      if (!product)
        throw new BillingError(
          `product ${item.productId} not found in this clinic`,
        );

      resolved.push({
        productId: product.id,
        description: product.name,
        quantity: item.quantity,
        unitPrice: money(product.price),
        discount: item.discount,
        taxRate: money(product.taxRate),
      });
      continue;
    }

    if (!item.description || item.unitPrice === undefined) {
      throw new BillingError(
        "a free line needs both a description and a unitPrice",
      );
    }

    resolved.push({
      productId: null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate ?? 0,
    });
  }

  return resolved;
}

async function insertItems(
  tx: Tx,
  clinicId: string,
  invoiceId: string,
  items: readonly ResolvedItem[],
): Promise<void> {
  if (items.length === 0) return;
  await tx.insert(invoiceItems).values(
    items.map((item, index) => ({
      clinicId,
      invoiceId,
      productId: item.productId,
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discount: String(item.discount),
      taxRate: String(item.taxRate),
      position: index,
    })),
  );
}

/** مبالغ را از سطرها بازمی‌سازد. باید پس از هر تغییر سطر فراخوانی شود. */
async function recalc(tx: Tx, clinicId: string, invoiceId: string): Promise<void> {
  await tx.execute(sql`SELECT fn_invoice_recalc(${clinicId}::uuid, ${invoiceId}::uuid)`);
}

export interface InvoiceCreateRecord {
  patientId: string;
  sessionId?: string | undefined;
  currency: string;
  dueAt?: Date | undefined;
  items: readonly InvoiceItemRecord[];
}

export async function createInvoice(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: InvoiceCreateRecord,
) {
  const resolvedItems = await resolveItems(tx, clinicId, input.items);

  const numberRes = await tx.execute(sql`SELECT fn_invoice_next_number(${clinicId}::uuid) AS number`);
  const number = ((numberRes as unknown as { rows?: Array<{ number: string }> }).rows ?? [])[0]?.number;
  if (!number) throw new BillingError("invoice number could not be allocated");

  const rows = await tx
    .insert(invoices)
    .values({
      clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId ?? null,
      number,
      state: "draft",
      currency: input.currency,
      dueAt: input.dueAt ?? null,
      createdBy: userId,
    })
    .returning({ id: invoices.id });
  const created = rows[0];
  if (!created) throw new BillingError("invoice insert returned no row");

  await insertItems(tx, clinicId, created.id, resolvedItems);
  await recalc(tx, clinicId, created.id);
  return getInvoice(tx, clinicId, created.id);
}

export async function getInvoice(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select(invoiceColumns)
    .from(invoices)
    .where(and(eq(invoices.clinicId, clinicId), eq(invoices.id, id), isNull(invoices.deletedAt)))
    .limit(1);
  const invoice = rows[0];
  if (!invoice) return null;

  const items = await tx
    .select(itemColumns)
    .from(invoiceItems)
    .where(
      and(
        eq(invoiceItems.clinicId, clinicId),
        eq(invoiceItems.invoiceId, id),
        isNull(invoiceItems.deletedAt),
      ),
    )
    .orderBy(asc(invoiceItems.position));
  return { ...invoice, items };
}

export interface InvoiceFilter {
  patientId?: string | undefined;
  state?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  offset: number;
}

export async function listInvoices(tx: Tx, clinicId: string, filter: InvoiceFilter) {
  const conditions = [eq(invoices.clinicId, clinicId), isNull(invoices.deletedAt)];
  if (filter.patientId) conditions.push(eq(invoices.patientId, filter.patientId));
  if (filter.state) conditions.push(eq(invoices.state, filter.state));
  if (filter.from) conditions.push(gte(invoices.createdAt, filter.from));
  if (filter.to) conditions.push(lte(invoices.createdAt, filter.to));
  return tx
    .select(invoiceColumns)
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(filter.limit)
    .offset(filter.offset);
}

/**
 * جایگزینی سطرها. فقط روی draft — ویرایش سطرهای یک سند صادرشده، تغییر
 * سندی است که بیمار نسخه‌اش را دارد. سطرهای قدیم soft-delete می‌شوند نه حذف:
 * هم چون DELETE از نقش اپ گرفته شده، هم چون تاریخِ ویرایش یک پیش‌فاکتور
 * ارزش دارد.
 */
export async function replaceInvoiceItems(
  tx: Tx,
  clinicId: string,
  id: string,
  items: readonly InvoiceItemRecord[],
) {
  const current = await getInvoice(tx, clinicId, id);
  if (!current) return null;
  if (current.state !== "draft") {
    throw new BillingError(`invoice ${current.number} is '${current.state}': only a draft can be re-lined`);
  }
  const resolvedItems = await resolveItems(tx, clinicId, items);

  await tx
    .update(invoiceItems)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(invoiceItems.clinicId, clinicId),
        eq(invoiceItems.invoiceId, id),
        isNull(invoiceItems.deletedAt),
      ),
    );
  await insertItems(tx, clinicId, id, resolvedItems);
  await recalc(tx, clinicId, id);
  return getInvoice(tx, clinicId, id);
}

/** draft → issued. از این لحظه سطرها قفل می‌شوند و مبلغ مرجع همین است. */
export async function issueInvoice(tx: Tx, clinicId: string, id: string) {
  const current = await getInvoice(tx, clinicId, id);
  if (!current) return null;
  if (current.state !== "draft") {
    throw new BillingError(`invoice ${current.number} is already '${current.state}'`);
  }
  if (current.items.length === 0) {
    throw new BillingError(`invoice ${current.number} has no lines to issue`);
  }
  await tx
    .update(invoices)
    .set({ state: "issued", issuedAt: sql`now()` })
    .where(and(eq(invoices.clinicId, clinicId), eq(invoices.id, id)));
  return getInvoice(tx, clinicId, id);
}

export interface PaymentRecord {
  amount: number;
  method: string;
  reference?: string | undefined;
  paidAt?: Date | undefined;
}

/**
 * ثبت پرداخت. ردیف اول FOR UPDATE قفل می‌شود: دو درخواست همزمان پرداخت، هر
 * دو می‌توانند paid_amount را از روی مقدار قدیم حساب کنند و یکی از دو پرداخت
 * در عمل گم شود. قید paid_bound در دیتابیس جلوی پرداخت اضافی را می‌گیرد، اما
 * قفل چیزی است که جمع درست را تضمین می‌کند.
 */
export async function payInvoice(tx: Tx, clinicId: string, id: string, payment: PaymentRecord) {
  if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
    throw new BillingError("payment amount must be a positive integer");
  }
  const locked = await tx.execute(sql`
    SELECT id, number, state, total::text AS total, paid_amount::text AS paid_amount
      FROM invoices
     WHERE clinic_id = ${clinicId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL
       FOR UPDATE
  `);
  const row = ((locked as unknown as {
    rows?: Array<{ number: string; state: string; total: string; paid_amount: string }>;
  }).rows ?? [])[0];
  if (!row) return null;

  if (row.state === "draft") {
    throw new BillingError(`invoice ${row.number} must be issued before it can be paid`);
  }
  if (row.state === "void" || row.state === "refunded") {
    throw new BillingError(`invoice ${row.number} is '${row.state}' and cannot take a payment`);
  }

  const total = money(row.total);
  const alreadyPaid = money(row.paid_amount);
  const nextPaid = alreadyPaid + payment.amount;
  if (nextPaid > total) {
    throw new BillingError(
      `payment of ${payment.amount} exceeds the ${total - alreadyPaid} still outstanding on ${row.number}`,
    );
  }

  const settled = nextPaid === total;
  await tx
    .update(invoices)
    .set({
      paidAmount: String(nextPaid),
      state: settled ? "paid" : "partially_paid",
      paymentMethod: payment.method,
      paymentRef: payment.reference ?? null,
      ...(settled ? { paidAt: payment.paidAt ?? sql`now()` } : {}),
    })
    .where(and(eq(invoices.clinicId, clinicId), eq(invoices.id, id)));
  return getInvoice(tx, clinicId, id);
}

/**
 * باطل کردن. فقط وقتی هیچ پولی گرفته نشده — همان قید invoices_void_unpaid_chk.
 * باطل کردن فاکتوری که پولش گرفته شده، عملاً گم کردن یک دریافتی است؛ مسیر
 * درستِ آن refund است که یک حالت جداگانه و یک تصمیم مالی دیگر است.
 */
export async function voidInvoice(tx: Tx, clinicId: string, id: string, reason: string) {
  const current = await getInvoice(tx, clinicId, id);
  if (!current) return null;
  if (current.state === "void") return current;
  if (money(current.paidAmount) > 0) {
    throw new BillingError(`invoice ${current.number} has payments recorded — refund it instead of voiding it`);
  }
  await tx
    .update(invoices)
    .set({ state: "void", voidedAt: sql`now()`, voidReason: reason.slice(0, 300) })
    .where(and(eq(invoices.clinicId, clinicId), eq(invoices.id, id)));
  return getInvoice(tx, clinicId, id);
}

/** soft-delete فاکتور و سطرهایش. فقط draft یا void — سند پرداخت‌شده نمی‌رود. */
export async function softDeleteInvoice(tx: Tx, clinicId: string, id: string): Promise<boolean> {
  const current = await getInvoice(tx, clinicId, id);
  if (!current) return false;
  if (current.state !== "draft" && current.state !== "void") {
    throw new BillingError(`invoice ${current.number} is '${current.state}' and cannot be deleted`);
  }
  await tx
    .update(invoiceItems)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(invoiceItems.clinicId, clinicId),
        eq(invoiceItems.invoiceId, id),
        isNull(invoiceItems.deletedAt),
      ),
    );
  const rows = await tx
    .update(invoices)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(invoices.clinicId, clinicId), eq(invoices.id, id), isNull(invoices.deletedAt)))
    .returning({ id: invoices.id });
  return rows.length > 0;
}

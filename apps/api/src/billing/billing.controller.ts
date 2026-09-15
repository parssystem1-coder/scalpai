import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  InvoiceCreate,
  InvoiceItemsReplace,
  InvoicePayment,
  InvoiceQuery,
  InvoiceVoid,
  ProductCreate,
  ProductQuery,
  ProductUpdate,
  type InvoiceCreateDto,
  type InvoiceItemsReplaceDto,
  type InvoicePaymentDto,
  type InvoiceQueryDto,
  type InvoiceVoidDto,
  type ProductCreateDto,
  type ProductQueryDto,
  type ProductUpdateDto,
} from "@scalpai/shared";
import { RateLimit } from "../common/rate-limit.guard.js";
import { Roles } from "../common/roles.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { BillingService } from "./billing.service.js";

/**
 * صورتحساب — سطح HTTP (فاز ۵a / ADR-0046).
 *
 * نقش‌ها اینجا تنگ‌تر از aftercare اند، و تقسیمش عمدی است:
 *
 *   • منشی می‌تواند پیش‌فاکتور بسازد، صادر کند و پرداخت بگیرد — کار روزانه‌اش
 *     دقیقاً همین است.
 *   • باطل کردن و حذف فقط owner — این‌ها پاک کردن یک سند مالی اند، نه
 *     ثبت کردنِ یک واقعه.
 *   • کاتالوگ فقط owner/trichologist — قیمتِ کاتالوگ پایه‌ی هر فاکتور بعدی
 *     است.
 *
 * عمداً بدون `@RequireFeature`: صورتحساب یک قابلیت پایه است، نه یک افزونه‌ی
 * پلن. گیت کردنِ فاکتور پشت یک فیچر یعنی یک کلینیک می‌تواند در وضعیتی
 * بیفتد که درمان می‌کند ولی نمی‌تواند پول بگیرد.
 */
@Controller("billing")
export class BillingController {
  constructor(private billing: BillingService) {}

  /* ── products ── */

  @Get("products")
  @Roles("owner", "trichologist", "receptionist")
  listProducts(@Query(new ZodBodyPipe(ProductQuery)) q: ProductQueryDto) {
    return this.billing.listProducts(q);
  }

  @Post("products")
  @Roles("owner", "trichologist")
  @RateLimit("billing-write", 120)
  @HttpCode(HttpStatus.CREATED)
  createProduct(@Body(new ZodBodyPipe(ProductCreate)) dto: ProductCreateDto) {
    return this.billing.createProduct(dto);
  }

  @Get("products/:id")
  @Roles("owner", "trichologist", "receptionist")
  getProduct(@Param("id") id: string) {
    return this.billing.getProduct(id);
  }

  @Patch("products/:id")
  @Roles("owner", "trichologist")
  @RateLimit("billing-write", 120)
  updateProduct(@Param("id") id: string, @Body(new ZodBodyPipe(ProductUpdate)) dto: ProductUpdateDto) {
    return this.billing.updateProduct(id, dto);
  }

  /** soft-delete. سطرهای فاکتورهای قدیمی دست‌نخورده می‌مانند: مقدارشان کپی شده بود. */
  @Delete("products/:id")
  @Roles("owner")
  @RateLimit("billing-write", 120)
  deleteProduct(@Param("id") id: string) {
    return this.billing.deleteProduct(id);
  }

  /* ── invoices ── */

  @Get("invoices")
  @Roles("owner", "trichologist", "receptionist")
  listInvoices(@Query(new ZodBodyPipe(InvoiceQuery)) q: InvoiceQueryDto) {
    return this.billing.listInvoices(q);
  }

  @Post("invoices")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("billing-write", 120)
  @HttpCode(HttpStatus.CREATED)
  createInvoice(@Body(new ZodBodyPipe(InvoiceCreate)) dto: InvoiceCreateDto) {
    return this.billing.createInvoice(dto);
  }

  @Get("invoices/:id")
  @Roles("owner", "trichologist", "receptionist")
  getInvoice(@Param("id") id: string) {
    return this.billing.getInvoice(id);
  }

  /** جایگزینی کامل سطرها — فقط تا وقتی پیش‌فاکتور است (سرویس بقیه را رد می‌کند). */
  @Post("invoices/:id/items")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("billing-write", 120)
  @HttpCode(HttpStatus.OK)
  replaceItems(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(InvoiceItemsReplace)) dto: InvoiceItemsReplaceDto,
  ) {
    return this.billing.replaceItems(id, dto);
  }

  @Post("invoices/:id/issue")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("billing-write", 120)
  @HttpCode(HttpStatus.OK)
  issue(@Param("id") id: string) {
    return this.billing.issue(id);
  }

  /**
   * پرداخت. مبلغ اجباری است و برابر total فرض نمی‌شود — پرداخت جزئی در
   * کلینیک عادی است و حالت partially_paid برای همین وجود دارد.
   */
  @Post("invoices/:id/payments")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("billing-payment", 120)
  @HttpCode(HttpStatus.OK)
  pay(@Param("id") id: string, @Body(new ZodBodyPipe(InvoicePayment)) dto: InvoicePaymentDto) {
    return this.billing.pay(id, dto);
  }

  /** باطل کردن — فقط وقتی هیچ پولی گرفته نشده. وگرنه مسیر درست refund است. */
  @Post("invoices/:id/void")
  @Roles("owner")
  @RateLimit("billing-write", 120)
  @HttpCode(HttpStatus.OK)
  voidInvoice(@Param("id") id: string, @Body(new ZodBodyPipe(InvoiceVoid)) dto: InvoiceVoidDto) {
    return this.billing.voidInvoice(id, dto.reason);
  }

  @Delete("invoices/:id")
  @Roles("owner")
  @RateLimit("billing-write", 120)
  deleteInvoice(@Param("id") id: string) {
    return this.billing.deleteInvoice(id);
  }
}

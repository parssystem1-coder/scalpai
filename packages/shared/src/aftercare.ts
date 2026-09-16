import { z } from "zod";

/**
 * فاز ۵a — Aftercare، Messaging و Billing (ADR-0046).
 *
 * قرارداد واحدِ سیمی برای هر سه مادول. پوره‌ اس ای: نه node:crypto، نه fs —
 * باندل مرورگر هم همین فایل را import می‌کند.
 *
 * دو چیزی که اینجا عمدی است و موقع ریویو به چشم می‌آید:
 *
 *   ۱) مجموعه‌های بسته (channel، state، trigger، …) همان مجموعه‌های CHECK در
 *      0017 هستند. یک مقدار تازه باید هر دو جا اضافه شود، و این فیچر است
 *      نه تکرار: قید دیتابیس حرف آخر را می‌زند و این فایل پیغام خطای درست
 *      را می‌دهد.
 *
 *   ۲) شماره تلفن فقط در یک جای این فایل وجود دارد: `InboundMessageIngest`،
 *      یعنی همان جایی که webhook پروایدر واقعاً شماره می‌فرستد. هیچ
 *      پاسخی و هیچ ردیفی شماره برنمی‌گرداند — فقط hash.
 */

/* ── مجموعه‌های بسته ────────────────────────────────── */

export const MESSAGING_CHANNELS = ["kavenegar", "bale", "eitaa", "telegram", "whatsapp"] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

export const MESSAGE_LOCALES = ["fa", "en"] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];

export const MESSAGE_STATES = ["queued", "sent", "delivered", "failed", "suppressed"] as const;
export type MessageState = (typeof MESSAGE_STATES)[number];

export const INBOUND_STATES = ["new", "read", "replied", "archived"] as const;
export type InboundState = (typeof INBOUND_STATES)[number];

export const INBOUND_INTENTS = ["unknown", "question", "reschedule", "stop", "confirm"] as const;
export type InboundIntent = (typeof INBOUND_INTENTS)[number];

export const AFTERCARE_TRIGGERS = ["manual", "session_completed", "analysis_created", "invoice_paid"] as const;
export type AftercareTrigger = (typeof AFTERCARE_TRIGGERS)[number];

export const ENROLLMENT_STATES = ["active", "paused", "completed", "cancelled"] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export const PRODUCT_KINDS = ["goods", "service", "package"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const INVOICE_STATES = ["draft", "issued", "paid", "partially_paid", "void", "refunded"] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

export const PAYMENT_METHODS = ["cash", "card", "transfer", "gateway", "credit"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * حالت‌های یک تلاش پرداخت (بلاکر B3) — همان مجموعه‌ی CHECK در 0021.
 *
 * حالت پرداخت دیگر در حافظه‌ی پروسه نیست، در Postgres است؛ پس ماشین حالت
 * باید در هر سه جا یکی باشد: قید دیتابیس، ریپوی packages/db، و این قرارداد.
 *
 *   pending → started → callback_received → verified | failed
 *   pending | started → expired
 */
export const PAYMENT_ATTEMPT_STATUSES = [
  "pending",
  "started",
  "callback_received",
  "verified",
  "failed",
  "expired",
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

/** حالت‌های پایانی: هیچ گذاری از آن‌ها بیرون نمی‌رود. */
export const PAYMENT_ATTEMPT_TERMINAL_STATUSES = ["verified", "failed", "expired"] as const;

export function isPaymentAttemptTerminal(status: string): boolean {
  return (PAYMENT_ATTEMPT_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/* ── کرانه‌ها ────────────────────────────────────────── */

/** سقف numeric(12,0) پشت همه‌ی ستون‌های مبلغ. ریال کسر ندارد، پس int است. */
export const MONEY_MAX = 999_999_999_999;
/** بیشترین گام یک دنباله — همان عددِ CHECK در 0017. */
export const AFTERCARE_MAX_STEPS = 40;
/** حداکثر تاخیر یک گام: ۹۹۹۹۹ ساعت ≈ ۱۱ سال. بیشتر از این باگ است نه پیگیری. */
export const AFTERCARE_MAX_OFFSET_HOURS = 99_999;
export const MESSAGE_BODY_MAX = 8_000;
export const MESSAGE_TEMPLATE_KEY_MAX = 80;

const Money = z.coerce.number().int("مبلغ باید عدد صحیح باشد").min(0).max(MONEY_MAX);
const TaxRate = z.coerce.number().min(0).max(100);
const Uuid = z.string().uuid();
/** همان الگوی PatientCreate — دو جای مختلف نباید دو فرمت موبایل قبول کنند. */
const IranMobile = z.string().regex(/^0\d{10}$/, "فرمت موبایل: 09xxxxxxxxx");
const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "sha256 باید ۶۴ رقم hex باشد");

export const TemplateKey = z
  .string()
  .min(1)
  .max(MESSAGE_TEMPLATE_KEY_MAX)
  .regex(/^[a-z][a-z0-9_.-]*$/, "templateKey فقط حروف کوچک، رقم، _ . - می‌پذیرد");

/* ══ ۱) Aftercare sequences ════════════════════════════════════════ */

/**
 * یک گام. `offsetHours` فاصله از لحطه ثبت‌نام است، نه از گام قبلی: با فاصله‌ی
 * نسبی، یک تاخیر در گام دوم همه‌ی گام‌های بعد را جابه‌جا می‌کند و «پیام روز
 * هفتم» دیگر روز هفتم نیست.
 */
export const AftercareStep = z.object({
  offsetHours: z.coerce.number().int().min(0).max(AFTERCARE_MAX_OFFSET_HOURS),
  channel: z.enum(MESSAGING_CHANNELS),
  templateKey: TemplateKey,
  /** جایگزین‌های ثابت قالب (مثلاً نام کلینیک). هرگز PHI. */
  vars: z.record(z.string().min(1).max(40), z.string().max(200)).optional(),
});
export type AftercareStepDto = z.infer<typeof AftercareStep>;

/**
 * گام‌ها باید صعودی و بی‌تکرار باشند. دو گام با همان offsetHours و همان
 * channel یعنی دو پیام در یک لحطه روی یک خط — کاربر این را نمی‌خواسته، دو بار
 * کلیک کرده.
 */
const AftercareSteps = z
  .array(AftercareStep)
  .max(AFTERCARE_MAX_STEPS)
  .superRefine((steps, ctx) => {
    const seen = new Set<string>();
    let previous = -1;
    steps.forEach((step, i) => {
      if (step.offsetHours < previous) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "offsetHours"],
          message: "گام‌ها باید براساس offsetHours صعودی باشند",
        });
      }
      previous = step.offsetHours;
      const key = `${step.offsetHours}:${step.channel}:${step.templateKey}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i],
          message: "گام تکراری: همان قالب در همان زمان و همان کانال",
        });
      }
      seen.add(key);
    });
  });

export const AftercareSequenceCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional(),
    trigger: z.enum(AFTERCARE_TRIGGERS).default("manual"),
    serviceId: Uuid.optional(),
    locale: z.enum(MESSAGE_LOCALES).default("fa"),
    steps: AftercareSteps.default([]),
    active: z.boolean().default(true),
  })
  .superRefine((seq, ctx) => {
    // همان قید aftercare_sequences_active_needs_steps_chk: دنباله فعالِ بی‌گام،
    // یک وعده است که هیچ‌وقت اجرا نمی‌شود. ۴۰۰ بهتر از یک دنباله مرده است.
    if (seq.active && seq.steps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "دنباله فعال دست‌کم یک گام لازم دارد",
      });
    }
    if (seq.trigger === "session_completed" && !seq.serviceId) {
      // بدون serviceId این trigger روی هر جلسه‌ای می‌افتد، که عملاً spam است
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceId"],
        message: "برای trigger=session_completed مشخص کردن serviceId الزامی است",
      });
    }
  });
export type AftercareSequenceCreateDto = z.infer<typeof AftercareSequenceCreate>;

/** ویرایش جزئی. حداقل یک فیلد لازم است — PATCH خالی یک درخواست بی‌معناست. */
export const AftercareSequenceUpdate = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    trigger: z.enum(AFTERCARE_TRIGGERS).optional(),
    serviceId: Uuid.nullable().optional(),
    locale: z.enum(MESSAGE_LOCALES).optional(),
    steps: AftercareSteps.optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "دست‌کم یک فیلد برای ویرایش لازم است",
  });
export type AftercareSequenceUpdateDto = z.infer<typeof AftercareSequenceUpdate>;

/* ══ ۲) Enrollments ══════════════════════════════════════════════ */

export const AftercareEnrollmentCreate = z.object({
  sequenceId: Uuid,
  patientId: Uuid,
  sessionId: Uuid.optional(),
  locale: z.enum(MESSAGE_LOCALES).optional(),
  /**
   * مبدأ محاسبه offsetHours. پیش‌فرض اکنون است، اما برای ثبت‌نامِ یک جلسه‌ی
   * دیروز باید قابل تعیین باشد — وگرنه پیام «۲۴ ساعت بعد» فردا می‌رود.
   */
  startAt: z.string().datetime().optional(),
});
export type AftercareEnrollmentCreateDto = z.infer<typeof AftercareEnrollmentCreate>;

export const AftercareEnrollmentAction = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
  reason: z.string().min(4).max(300).optional(),
});
export type AftercareEnrollmentActionDto = z.infer<typeof AftercareEnrollmentAction>;

export const AftercareEnrollmentQuery = z.object({
  patientId: Uuid.optional(),
  sequenceId: Uuid.optional(),
  state: z.enum(ENROLLMENT_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AftercareEnrollmentQueryDto = z.infer<typeof AftercareEnrollmentQuery>;

/* ══ ۳) Messaging ─ outbound ══════════════════════════════════════ */

/**
 * ارسال دستی یک پیام خارج از دنباله. مخاطب با `patientId` مشخص می‌شود نه
 * با شماره: شماره از ردیف بیمار خوانده می‌شود. پس یک توکن دزدیده‌شده هم
 * فقط به بیماران همان کلینیک پیام می‌دهد، نه به هر شماره‌ای در جهان.
 */
export const MessageSendRequest = z.object({
  patientId: Uuid,
  channel: z.enum(MESSAGING_CHANNELS).optional(),
  templateKey: TemplateKey,
  locale: z.enum(MESSAGE_LOCALES).optional(),
  vars: z.record(z.string().min(1).max(40), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
  /** کلید یکتایی ارسال. ندادنش یعنی سرور خودش می‌سازد. */
  idempotencyKey: z.string().min(8).max(120).optional(),
});
export type MessageSendRequestDto = z.infer<typeof MessageSendRequest>;

/**
 * چیزی که از دفتر پیام بیرون می‌رود. دقت کنید چه چیزی اینجا نیست: شماره،
 * متن، و متغیرهای خام. فقط hash و فراداده.
 */
export const MessageLogEntry = z.object({
  id: Uuid,
  channel: z.enum(MESSAGING_CHANNELS),
  templateKey: TemplateKey,
  locale: z.enum(MESSAGE_LOCALES),
  state: z.enum(MESSAGE_STATES),
  recipientHash: Sha256Hex,
  bodySha256: Sha256Hex,
  bodyChars: z.number().int().min(0).max(MESSAGE_BODY_MAX),
  attempts: z.number().int().min(0),
  provider: z.string().max(40).nullable().optional(),
  providerMessageId: z.string().max(200).nullable().optional(),
  lastError: z.string().max(300).nullable().optional(),
  queuedAt: z.string(),
  sentAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  failedAt: z.string().nullable().optional(),
});
export type MessageLogEntryDto = z.infer<typeof MessageLogEntry>;

/* ══ ۴) Messaging ─ inbound ═══════════════════════════════════════ */

/**
 * تنها جای این فایل که شماره تلفن می‌پذیرد: webhook پروایدر شماره می‌فرستد
 * و چاره‌ای نیست. سرویس بلافاصله آن را به hash تبدیل می‌کند و متن را رمز می‌کند؛
 * هیچ ردیفی شماره را خوانا نگه نمی‌دارد.
 */
export const InboundMessageIngest = z.object({
  channel: z.enum(MESSAGING_CHANNELS),
  provider: z.string().min(1).max(40).optional(),
  providerMessageId: z.string().min(1).max(200).optional(),
  from: IranMobile,
  body: z.string().min(1).max(MESSAGE_BODY_MAX),
  receivedAt: z.string().datetime().optional(),
  replyToProviderMessageId: z.string().max(200).optional(),
});
export type InboundMessageIngestDto = z.infer<typeof InboundMessageIngest>;

export const InboxQuery = z.object({
  state: z.enum(INBOUND_STATES).optional(),
  channel: z.enum(MESSAGING_CHANNELS).optional(),
  patientId: Uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type InboxQueryDto = z.infer<typeof InboxQuery>;

export const InboundMessageUpdate = z.object({
  state: z.enum(["read", "replied", "archived"]),
  intent: z.enum(INBOUND_INTENTS).optional(),
});
export type InboundMessageUpdateDto = z.infer<typeof InboundMessageUpdate>;

/**
 * ردیف inbox. `bodyPreview` نسخه scrub شده است؛ متن کامل فقط از endpoint جداگانه
 * و با رمزگشایی می‌آید — همان تفکیکی که فاز ۶ بین لیست بیماران و یادداشت بالینی
 * گذاشت.
 */
export const InboxEntry = z.object({
  id: Uuid,
  channel: z.enum(MESSAGING_CHANNELS),
  state: z.enum(INBOUND_STATES),
  intent: z.enum(INBOUND_INTENTS).nullable().optional(),
  patientId: Uuid.nullable().optional(),
  senderHash: Sha256Hex,
  bodyPreview: z.string().max(200).nullable().optional(),
  receivedAt: z.string(),
  handledAt: z.string().nullable().optional(),
});
export type InboxEntryDto = z.infer<typeof InboxEntry>;

/* ══ ۵) Billing ─ products ════════════════════════════════════════ */

export const ProductCreate = z
  .object({
    sku: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, "فرمت sku نامعتبر است"),
    name: z.string().trim().min(1).max(160),
    kind: z.enum(PRODUCT_KINDS).default("goods"),
    serviceId: Uuid.optional(),
    unit: z.string().min(1).max(24).default("unit"),
    price: Money.default(0),
    currency: z.string().regex(/^[A-Z]{3}$/).default("IRR"),
    taxRate: TaxRate.default(0),
    active: z.boolean().default(true),
  })
  .superRefine((product, ctx) => {
    // همان products_service_kind_chk
    if (product.serviceId && product.kind === "goods") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceId"],
        message: "serviceId فقط روی kind از نوع service یا package معنا دارد",
      });
    }
  });
export type ProductCreateDto = z.infer<typeof ProductCreate>;

export const ProductUpdate = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    kind: z.enum(PRODUCT_KINDS).optional(),
    serviceId: Uuid.nullable().optional(),
    unit: z.string().min(1).max(24).optional(),
    price: Money.optional(),
    taxRate: TaxRate.optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "دست‌کم یک فیلد برای ویرایش لازم است",
  });
export type ProductUpdateDto = z.infer<typeof ProductUpdate>;

/** sku و currency در ویرایش غایبند: هر دو روی سندهای صادرشده اثر دارند. */
export const ProductQuery = z.object({
  q: z.string().max(120).optional(),
  kind: z.enum(PRODUCT_KINDS).optional(),
  active: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ProductQueryDto = z.infer<typeof ProductQuery>;

/* ══ ۶) Billing ─ invoices ═══════════════════════════════════════ */

/**
 * یک سطر. اگر `productId` بیاید، سرور description/unitPrice/taxRate را از کاتالوگ
 * کپی می‌کند و ادعای کلاینت را دور می‌ریزد — وگرنه هر کاربری می‌تواند قیمت
 * دلخواه بفرستد. بدون productId (سطر آزاد) description و unitPrice اجباری‌اند.
 */
export const InvoiceItemInput = z
  .object({
    productId: Uuid.optional(),
    description: z.string().trim().min(1).max(200).optional(),
    quantity: z.coerce.number().positive().max(100_000).default(1),
    unitPrice: Money.optional(),
    discount: Money.default(0),
    taxRate: TaxRate.optional(),
  })
  .superRefine((item, ctx) => {
    if (!item.productId) {
      if (!item.description) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["description"],
          message: "برای سطر بدون productId، description الزامی است",
        });
      }
      if (item.unitPrice === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unitPrice"],
          message: "برای سطر بدون productId، unitPrice الزامی است",
        });
      }
    }
    // همان invoice_items_discount_bound_chk، ولی با پیام خوانا به‌جای خطای 23514
    if (item.unitPrice !== undefined && item.discount > Math.round(item.quantity * item.unitPrice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discount"],
        message: "تخفیف نمی‌تواند بیشتر از مبلغ سطر باشد",
      });
    }
  });
export type InvoiceItemInputDto = z.infer<typeof InvoiceItemInput>;

export const INVOICE_MAX_ITEMS = 100;

export const InvoiceCreate = z.object({
  patientId: Uuid,
  sessionId: Uuid.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("IRR"),
  dueAt: z.string().datetime().optional(),
  items: z.array(InvoiceItemInput).min(1).max(INVOICE_MAX_ITEMS),
});
export type InvoiceCreateDto = z.infer<typeof InvoiceCreate>;

/** جایگزینی کامل سطرها. تنها روی draft مجاز است (سرویس این را می‌بندد). */
export const InvoiceItemsReplace = z.object({
  items: z.array(InvoiceItemInput).min(1).max(INVOICE_MAX_ITEMS),
});
export type InvoiceItemsReplaceDto = z.infer<typeof InvoiceItemsReplace>;

/**
 * پرداخت. `amount` اجباری است و برابرِ total فرض نمی‌شود: پرداخت جزئی در
 * کلینیک عادی است و حالت partially_paid دقیقاً برای همین وجود دارد.
 */
export const InvoicePayment = z.object({
  amount: Money,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(120).optional(),
  paidAt: z.string().datetime().optional(),
});
export type InvoicePaymentDto = z.infer<typeof InvoicePayment>;

export const InvoiceVoid = z.object({
  reason: z.string().min(4).max(300),
});
export type InvoiceVoidDto = z.infer<typeof InvoiceVoid>;

export const InvoiceQuery = z.object({
  patientId: Uuid.optional(),
  state: z.enum(INVOICE_STATES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type InvoiceQueryDto = z.infer<typeof InvoiceQuery>;

/* ══ ۷) Metering ══════════════════════════════════════════════ */

/**
 * متریک‌های متر شده‌ی فاز ۵a. نام‌ها همان `usage_counters.metric` هستند — اگر
 * اینجا و در metering.repo یکی نباشند، مصرف در دو ردیف مختلف جمع می‌شود و هیچ
 * سقفی واقعاً اعمال نمی‌شود.
 */
export const METERED_METRICS = ["upload_mb", "analyses", "messages_sent"] as const;
export type MeteredMetric = (typeof METERED_METRICS)[number];

export function isMeteredMetric(value: string): value is MeteredMetric {
  return (METERED_METRICS as readonly string[]).includes(value);
}

export const UsageSnapshot = z.object({
  metric: z.enum(METERED_METRICS),
  used: z.number().int().min(0),
  limit: z.number().int().min(0).nullable(),
  periodStart: z.string(),
});
export type UsageSnapshotDto = z.infer<typeof UsageSnapshot>;

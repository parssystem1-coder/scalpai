import { eq } from "drizzle-orm";
import { webhookProviders } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * webhook_providers — لایه داده.
 *
 * این جدول ارائه‌دهندگان وبهوک را به کلینیک متصل می‌کند تا WebhookGuard
 * بتواند بعد از تأیید HMAC، clinicId را پیدا کند و tenant context را
 * روی AsyncLocalStorage بنویسد (بلاکر B1).
 */

export class WebhookProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookProviderError";
  }
}

const providerColumns = {
  id: webhookProviders.id,
  provider: webhookProviders.provider,
  clinicId: webhookProviders.clinicId,
  webhookSecret: webhookProviders.webhookSecret,
  signatureHeader: webhookProviders.signatureHeader,
  active: webhookProviders.active,
  createdAt: webhookProviders.createdAt,
  updatedAt: webhookProviders.updatedAt,
} as const;

/**
 * پیدا کردن ارائه‌دهنده فعال بر اساس نام.
 * فقط ردیف‌های active=true برمی‌گردند (ایندکس partial).
 */
export async function findActiveProvider(tx: Tx, provider: string): Promise<{
  id: string;
  provider: string;
  clinicId: string;
  webhookSecret: string;
  signatureHeader: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
} | undefined> {
  const rows = await tx
    .select(providerColumns)
    .from(webhookProviders)
    .where(eq(webhookProviders.provider, provider.trim().toLowerCase()))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return undefined;
  return row;
}

/**
 * پیدا کردن ارائه‌دهنده فعال + فیلتر روی clinicId.
 * برای زمانی که webhook secret هم نیاز است.
 */
export async function findActiveProviderForClinic(
  tx: Tx,
  provider: string,
  clinicId: string,
): Promise<{
  id: string;
  provider: string;
  clinicId: string;
  webhookSecret: string;
  signatureHeader: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
} | undefined> {
  const rows = await tx
    .select(providerColumns)
    .from(webhookProviders)
    .where(
      eq(webhookProviders.provider, provider.trim().toLowerCase()) &&
        eq(webhookProviders.clinicId, clinicId),
    )
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return undefined;
  return row;
}

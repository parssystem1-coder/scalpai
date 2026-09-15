import { NotifyError } from "../types.js";

export interface ZarinpalHttpClient {
  post<T>(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ readonly status: number; readonly ok: boolean; json(): Promise<T> }>;
}

interface AuthorityResponse { readonly data?: { readonly authority?: string; readonly code?: number } }
interface VerifyResponse { readonly data?: { readonly code?: number; readonly ref_id?: number } }
export interface PaymentResult { readonly verified: boolean; readonly authority: string; readonly refId?: string; readonly reason?: string }

const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutMs(env: Record<string, string | undefined>): number {
  const value = Number(env.NOTIFY_HTTP_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 60_000 ? Math.floor(value) : DEFAULT_TIMEOUT_MS;
}

/**
 * The gateway is charged in rials and rials have no fraction, so anything that
 * is not a positive safe integer is a caller bug - most likely a toman amount
 * or a float from a discount calculation. Rejecting before the request keeps a
 * 10x mischarge from reaching the provider, where it would need a refund
 * instead of a 400.
 */
function assertRialAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new NotifyError("payment amount must be a positive integer in rials");
  }
}

/** Zarinpal sandbox/production adapter. Amounts are sent in rials. */
export class ZarinpalAdapter {
  readonly requestUrl: string;
  readonly verifyUrl: string;
  readonly gatewayUrl: string;

  constructor(
    private readonly http: ZarinpalHttpClient = fetchZarinpalHttp,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    this.requestUrl = env.ZARINPAL_REQUEST_URL ?? "https://sandbox.zarinpal.com/pg/v4/payment/request.json";
    this.verifyUrl = env.ZARINPAL_VERIFY_URL ?? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json";
    this.gatewayUrl = env.ZARINPAL_GATEWAY_URL ?? "https://sandbox.zarinpal.com/pg/StartPay/";
  }

  async requestPayment(invoiceId: string, amount: number, callbackUrl: string): Promise<string> {
    assertRialAmount(amount);
    const merchant = this.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchant) throw new NotifyError("payment provider is not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(this.env));
    try {
      const response = await this.http.post<AuthorityResponse>(
        this.requestUrl,
        { merchant_id: merchant, amount, callback_url: callbackUrl, description: "ScalpAI payment", metadata: { invoice_id: invoiceId } },
        controller.signal,
      );
      const payload = await response.json();
      const code = payload.data?.code;
      const authority = payload.data?.authority;
      if (!response.ok || code !== 100 || !authority) throw new NotifyError("payment request failed");
      return `${this.gatewayUrl}${encodeURIComponent(authority)}`;
    } catch (error) {
      if (error instanceof NotifyError) throw error;
      throw new NotifyError(error instanceof Error && error.name === "AbortError" ? "payment provider timeout" : "payment provider unreachable");
    } finally {
      clearTimeout(timer);
    }
  }

  async verifyPayment(authority: string, amount: number): Promise<PaymentResult> {
    assertRialAmount(amount);
    const merchant = this.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchant) throw new NotifyError("payment provider is not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(this.env));
    try {
      const response = await this.http.post<VerifyResponse>(
        this.verifyUrl,
        { merchant_id: merchant, amount, authority },
        controller.signal,
      );
      const payload = await response.json();
      const code = payload.data?.code;
      return {
        verified: response.ok && (code === 100 || code === 101),
        authority,
        refId: payload.data?.ref_id === undefined ? undefined : String(payload.data.ref_id),
        reason: code === 101 ? "already-verified" : code === 100 ? undefined : "verification-failed",
      };
    } catch (error) {
      if (error instanceof NotifyError) throw error;
      throw new NotifyError(error instanceof Error && error.name === "AbortError" ? "payment provider timeout" : "payment provider unreachable");
    } finally {
      clearTimeout(timer);
    }
  }
}

const fetchZarinpalHttp: ZarinpalHttpClient = {
  async post<T>(url: string, body: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return {
      status: response.status,
      ok: response.ok,
      json: async () => {
        const payload: unknown = await response.json();
        return payload as T;
      },
    };
  },
};

export const zarinpalAdapter = new ZarinpalAdapter();

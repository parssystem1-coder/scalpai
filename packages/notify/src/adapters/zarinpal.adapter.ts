export interface ZarinpalHttpClient {
  post<T>(url: string, body: Record<string, unknown>): Promise<{ readonly status: number; readonly ok: boolean; json(): Promise<T> }>;
}

interface AuthorityResponse { readonly data?: { readonly authority?: string; readonly code?: number }; readonly errors?: unknown }
interface VerifyResponse { readonly data?: { readonly code?: number; readonly ref_id?: number; readonly card_hash?: string }; readonly errors?: unknown }
export interface PaymentResult { readonly verified: boolean; readonly authority: string; readonly refId?: string; readonly reason?: string }

/** Zarinpal sandbox adapter. Amounts are sent in rials, as required by the API. */
export class ZarinpalAdapter {
  readonly requestUrl: string;
  readonly verifyUrl: string;
  readonly gatewayUrl: string;
  constructor(private readonly http: ZarinpalHttpClient = fetchZarinpalHttp, private readonly env: Record<string, string | undefined> = process.env) {
    this.requestUrl = env.ZARINPAL_REQUEST_URL ?? "https://sandbox.zarinpal.com/pg/v4/payment/request.json";
    this.verifyUrl = env.ZARINPAL_VERIFY_URL ?? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json";
    this.gatewayUrl = env.ZARINPAL_GATEWAY_URL ?? "https://sandbox.zarinpal.com/pg/StartPay/";
  }
  async requestPayment(invoiceId: string, amount: number, callbackUrl: string): Promise<string> {
    const merchant = this.env.ZARINPAL_MERCHANT_ID;
    if (!merchant) throw new Error("ZARINPAL_MERCHANT_ID is not configured");
    const response = await this.http.post<AuthorityResponse>(this.requestUrl, { merchant_id: merchant, amount, callback_url: callbackUrl, description: `ScalpAI invoice ${invoiceId}`, metadata: { invoice_id: invoiceId } });
    const payload = await response.json();
    const code = payload.data?.code;
    const authority = payload.data?.authority;
    if (!response.ok || code !== 100 || !authority) throw new Error(`Zarinpal request failed: ${code ?? "unknown"}`);
    return `${this.gatewayUrl}${encodeURIComponent(authority)}`;
  }
  async verifyPayment(authority: string, amount: number): Promise<PaymentResult> {
    const merchant = this.env.ZARINPAL_MERCHANT_ID;
    if (!merchant) throw new Error("ZARINPAL_MERCHANT_ID is not configured");
    const response = await this.http.post<VerifyResponse>(this.verifyUrl, { merchant_id: merchant, amount, authority });
    const payload = await response.json();
    const code = payload.data?.code;
    return { verified: response.ok && (code === 100 || code === 101), authority, refId: payload.data?.ref_id === undefined ? undefined : String(payload.data.ref_id), reason: code === 101 ? "already-verified" : code === 100 ? undefined : `verification-failed:${code ?? "unknown"}` };
  }
}

const fetchZarinpalHttp: ZarinpalHttpClient = {
  async post<T>(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ok: response.ok, json: async () => { const payload: unknown = await response.json(); return payload as T; } };
  },
};

export const zarinpalAdapter = new ZarinpalAdapter();

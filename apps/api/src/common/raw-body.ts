import type { FastifyInstance, FastifyRequest } from "fastify";

/** Request decorated with the exact bytes the client sent. */
export type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

/**
 * ثبت بدنه‌ی خام JSON (بازبینی فاز ۵b).
 *
 * امضای HMAC وبهوک روی بایت‌هایی است که پروایدر فرستاده، نه روی آبجکتی که
 * fastify از آن ساخته. پارسر پیش‌فرض بایت‌ها را دور می‌ریزد، پس `WebhookGuard`
 * چیزی برای تأیید نداشت و به `JSON.stringify(request.body)` عقب‌نشینی می‌کرد:
 * سریالایز دوباره، ترتیب کلید و فاصله را عوض می‌کند و امضای درست را رد
 * می‌کند (یا بدتر، نمایشِ دیگری را تأیید می‌کند).
 *
 * پارسر زیر همان کار پیش‌فرض را می‌کند و فقط بافر اصلی را روی request نگه
 * می‌دارد. بدنه‌ی خالی به `{}` نگاشته می‌شود و JSON نامعتبر همان ۴۰۰ همیشگی
 * را می‌گیرد.
 */
export function registerRawBodyCapture(fastify: FastifyInstance): void {
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser<Buffer>(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      (request as RawBodyRequest).rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(body.toString("utf8"));
        done(null, parsed);
      } catch {
        const error = new Error("Invalid JSON body") as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error, undefined);
      }
    },
  );
}

import type { ErrorBody } from "./contracts.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body.message);
  }
}

export const errors = {
  unauthorized: (msg = "اعتبارنامه نامعتبر است") => new ApiError(401, { code: "UNAUTHORIZED", message: msg }),
  forbidden: () => new ApiError(403, { code: "FORBIDDEN", message: "دسترسی مجاز نیست" }),
  notFound: () => new ApiError(404, { code: "NOT_FOUND", message: "یافت نشد" }),
  conflict: (msg = "رکورد تکراری است") => new ApiError(409, { code: "CONFLICT", message: msg }),
  validation: (details: unknown) => new ApiError(400, { code: "VALIDATION_ERROR", message: "ورودی نامعتبر", details }),
  quotaExceeded: () => new ApiError(403, { code: "QUOTA_EXCEEDED", message: "سهمیه پلن تکمیل شده است" }),
  featureDisabled: (f: string) => new ApiError(403, { code: "FEATURE_DISABLED", message: `فیچر فعال نیست: ${f}` }),
};

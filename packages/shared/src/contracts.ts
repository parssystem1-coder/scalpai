import { z } from "zod";

/** Canonical API error shape (engineering-rules §3) — nothing else may leave the API. */
export const ErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RefreshRequest = z.object({
  refreshToken: z.string().min(20),
});

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    clinicId: z.string(),
    role: z.enum(["owner", "trichologist", "receptionist"]),
  }),
});

export const PatientCreate = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().regex(/^0\d{10}$/, "فرمت موبایل: 09xxxxxxxxx"),
  gender: z.enum(["male", "female"]).optional(),
  birthDate: z.string().date().optional(),
});

export const PaginationQuery = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const SessionCreate = z.object({
  patientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
});

/** §9.1 — plan = DB record; new plan ships with INSERT/upsert only, no deploy. */
export const PlanUpsert = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  name: z.record(z.string().min(1), z.string().min(1)),
  price: z.coerce.number().int().min(0),
  interval: z.enum(["month", "year"]).default("month"),
  features: z.array(z.string().min(1)).default([]),
  limits: z.record(z.string(), z.number()).default({}),
});

export type LoginRequest = z.infer<typeof LoginRequest>;
export type RefreshRequest = z.infer<typeof RefreshRequest>;
export type TokenPair = z.infer<typeof TokenPair>;
export type PatientCreate = z.infer<typeof PatientCreate>;
export type PatientCreateDto = PatientCreate;
export type SessionCreate = z.infer<typeof SessionCreate>;
export type PlanUpsert = z.infer<typeof PlanUpsert>;
export type PlanUpsertDto = PlanUpsert;

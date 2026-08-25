import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Zod-first validation pipe — contracts live in packages/shared only. */
export class ZodBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private schema: ZodType<T>) {}
  transform(value: unknown): T {
    const res = this.schema.safeParse(value);
    if (!res.success) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "ورودی نامعتبر", details: res.error.issues });
    }
    return res.data;
  }
}

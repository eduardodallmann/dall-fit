import { Injectable, Logger, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

import { termsError } from '~/terms/domain/terms-errors';
import { termsLog } from '~/terms/domain/terms-log';

export const termsFieldsSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  bodyHtml: z
    .string()
    .min(1)
    .max(256 * 1024),
  operatorName: z.string().trim().min(1).max(200),
  operatorEmail: z.email().trim().max(254),
  changeSummary: z.string().trim().min(1).max(1000),
});
export const termsIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const createTermsSchema = z.union([
  termsFieldsSchema,
  z.strictObject({ sourceVersionId: termsIdSchema }),
]);
export const acceptTermsSchema = z.strictObject({
  termsVersionId: termsIdSchema,
  contentHash: z.string().regex(/^[a-f\d]{64}$/),
  accepted: z.literal(true),
  isAdult: z.literal(true),
});
export const publishTermsSchema = z.strictObject({
  expectedCurrentTermsId: termsIdSchema.nullable(),
  previewContentHash: z.string().regex(/^[a-f\d]{64}$/),
});

@Injectable()
export class TermsInputPipe implements PipeTransform<unknown, unknown> {
  private readonly logger = new Logger(TermsInputPipe.name);
  constructor(private readonly schema: z.ZodType) {}
  transform(value: unknown): unknown {
    termsLog(this.logger, 'TermsInputPipe', 'transform', 'params');
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      termsLog(this.logger, 'TermsInputPipe', 'transform', 'invalid branch');
      throw termsError(400, 'VALIDATION_ERROR');
    }
    const result = parsed.data;
    termsLog(this.logger, 'TermsInputPipe', 'transform', 'return', {
      valid: true,
    });
    return result;
  }
}

export function termsRevision(value: string | undefined): number {
  if (value === undefined) throw termsError(428, 'PRECONDITION_REQUIRED');
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw termsError(400, 'VALIDATION_ERROR');
  return Number(value);
}
export function termsPage(value: unknown): number {
  const result = value === undefined ? 1 : Number(value);
  if (
    typeof value !== 'undefined' &&
    (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
  )
    throw termsError(400, 'VALIDATION_ERROR');
  if (!Number.isSafeInteger(result) || result < 1 || result > 100)
    throw termsError(400, 'VALIDATION_ERROR');
  return result;
}

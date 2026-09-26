import { Body, HttpStatus, Param, Query, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppException } from '../filters/all-exceptions.filter';

/**
 * Validates and transforms input with a shared Zod schema (from @seshakart/validation),
 * so the API enforces exactly the rules the web forms show. Unknown keys are
 * stripped by Zod's default object behaviour, preventing mass-assignment.
 */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VALIDATION_FAILED',
      'Some of the information provided is not valid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
}

/** `@ZodBody(schema) body: T` — validated request body. */
export const ZodBody = (schema: ZodTypeAny) => Body(new ZodValidationPipe(schema));
/** `@ZodQuery(schema) query: T` — validated query string. */
export const ZodQuery = (schema: ZodTypeAny) => Query(new ZodValidationPipe(schema));
/** `@ZodParam('id', schema) id: T` — validated route parameter. */
export const ZodParam = (name: string, schema: ZodTypeAny) =>
  Param(name, new ZodValidationPipe(schema));

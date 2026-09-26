import type { ApiSuccess, PaginationMeta } from '@seshakart/types';

/**
 * Marks a controller result that is already a complete response envelope
 * (e.g. a paginated list carrying `meta`). Anything else is wrapped as `{ data }`.
 */
export class Envelope<T> implements ApiSuccess<T> {
  constructor(
    public readonly data: T,
    public readonly meta?: PaginationMeta,
  ) {}
}

export function paginated<T>(data: T, total: number, page: number, pageSize: number): Envelope<T> {
  return new Envelope(data, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

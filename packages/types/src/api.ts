/**
 * Transport contract shared by the API and every client (web today, Android/iOS later).
 *
 * Success:  { data, meta? }       with a 2xx status
 * Error:    { error: { ... } }    with a 4xx/5xx status
 *
 * Monetary values are always integers in paise (₹1 = 100 paise); timestamps are ISO-8601.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    /** Stable, machine-readable code, e.g. VALIDATION_FAILED, NOT_FOUND. */
    code: string;
    /** Human-readable message that is safe to show to customers. */
    message: string;
    details?: ApiFieldError[];
    /** Correlates the response with server logs; never contains internals. */
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down' | 'skipped'>;
}

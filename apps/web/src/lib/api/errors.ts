import type { ApiErrorBody, ApiFieldError } from '@seshakart/types';

/** Error thrown by the API clients; `message` is always safe to show to customers. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    try {
      const body = (await res.json()) as Partial<ApiErrorBody>;
      if (body.error)
        return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
    } catch {
      /* non-JSON error (proxy, network) */
    }
    return new ApiError(
      res.status,
      'NETWORK_ERROR',
      'We couldn’t reach SeShaKart. Check your connection and try again.',
    );
  }

  /** Field-level errors keyed by path, for forms. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

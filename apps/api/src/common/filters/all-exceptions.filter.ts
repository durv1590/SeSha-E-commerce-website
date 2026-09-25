import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody, ApiFieldError } from '@seshakart/types';
import type { Request, Response } from 'express';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** Thrown by services for domain errors that carry a stable machine-readable code. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: ApiFieldError[],
  ) {
    super(message, status);
  }
}

/**
 * Maps database errors that reach the edge to safe, stable API errors. Services
 * should normally translate these themselves with a domain-specific message; this
 * is the safety net. Constraint and column names are never exposed.
 */
export function mapDatabaseError(
  err: unknown,
): { status: HttpStatus; code: string; message: string } | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: 'This record already exists.',
        };
      case 'P2025':
      case 'P2001':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested item was not found.',
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'This item is linked to other records.',
        };
    }
  }
  const text = err instanceof Error ? err.message : '';
  // PostgreSQL 23514 = check_violation (e.g. stock would go negative).
  if (/23514|violates check constraint/.test(text)) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'CONSTRAINT_VIOLATION',
      message: 'The request conflicts with the current state. Please refresh and try again.',
    };
  }
  return null;
}

/**
 * Converts every error into the standard error envelope. Unexpected errors are
 * logged server-side with the request id; the client only ever receives a generic
 * message — never stack traces, SQL, file paths or configuration.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.header('x-request-id');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'] = {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    };

    const dbError = mapDatabaseError(exception);
    if (dbError) {
      status = dbError.status;
      body = { code: dbError.code, message: dbError.message };
    } else if (exception instanceof AppException) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof (response as { message?: unknown }).message === 'string'
            ? (response as { message: string }).message
            : exception.message;
      body = {
        code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
        // 5xx HttpExceptions may carry internal wording; keep the generic message for those.
        message: status >= 500 ? body.message : message,
      };
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({ error: { ...body, requestId } } satisfies ApiErrorBody);
  }
}

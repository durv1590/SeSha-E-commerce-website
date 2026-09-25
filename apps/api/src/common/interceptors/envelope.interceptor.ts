import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Envelope } from '../http/envelope';

/** Wraps every JSON controller result in the standard `{ data }` envelope. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value instanceof Envelope || value instanceof StreamableFile) return value;
        return new Envelope(value ?? null);
      }),
    );
  }
}

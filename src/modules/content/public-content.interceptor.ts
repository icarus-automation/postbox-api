import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';

type HeaderResponse = { setHeader: (name: string, value: string) => void };

// Helmet's default Cross-Origin-Resource-Policy is same-origin, which would
// hide this JSON from the site that fetched it.
@Injectable()
export class PublicContentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<HeaderResponse>();
    const mark = (cache: string) => {
      response.setHeader('Cache-Control', cache);
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    };
    return next.handle().pipe(
      tap(() => mark('public, max-age=60')),
      catchError((error: unknown) => {
        mark('no-store');
        return throwError(() => error);
      }),
    );
  }
}

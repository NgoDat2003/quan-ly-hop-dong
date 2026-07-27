import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Paired with ApiResponseDto (src/common/dto/api-response.dto.ts) — if this
// wrapping shape ever changes, that DTO (and every subclass) must change with
// it, or the documented OpenAPI schema silently stops matching the wire.
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  { statusCode: number; data: T }
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ statusCode: number; data: T }> {
    const statusCode = context.switchToHttp().getResponse().statusCode;
    return next.handle().pipe(map((data) => ({ statusCode, data })));
  }
}

import { ApiProperty } from '@nestjs/swagger';

/**
 * Base envelope. TransformInterceptor produces { statusCode, data } for every
 * successful response, so every documented response type extends this.
 * Services return ONLY the inner `data` shape — never a pre-wrapped object,
 * or the interceptor double-wraps it.
 */
export abstract class ApiResponseDto {
  @ApiProperty({ example: 200 })
  statusCode!: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from './api-response.dto';

// Envelope for endpoints whose result is just "did this succeed" — no
// meaningful payload beyond the statusCode already in ApiResponseDto (e.g.
// refresh/logout, where the actual result is the Set-Cookie header, not a
// JSON body field).
export class SuccessResponseDto extends ApiResponseDto {
  @ApiProperty({ example: true })
  declare data: { success: true };
}

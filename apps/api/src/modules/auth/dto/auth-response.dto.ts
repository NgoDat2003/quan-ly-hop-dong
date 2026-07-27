import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';
import { AuthResultDto } from './auth-result.dto';

export class AuthLoginResponseDto extends ApiResponseDto {
  @ApiProperty({ type: AuthResultDto })
  declare data: AuthResultDto;
}

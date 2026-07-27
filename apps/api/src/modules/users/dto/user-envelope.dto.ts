import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';
import { UserResponseDto } from './user-response.dto';

export class UserEnvelopeDto extends ApiResponseDto {
  @ApiProperty({ type: UserResponseDto })
  declare data: UserResponseDto;
}

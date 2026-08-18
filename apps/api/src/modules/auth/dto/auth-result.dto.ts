import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

// No accessToken/refreshToken field here on purpose — tokens are delivered
// as httpOnly cookies (Set-Cookie), never in the JSON body, so they can't
// be read by JS or logged alongside a captured response body.
export class AuthResultDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

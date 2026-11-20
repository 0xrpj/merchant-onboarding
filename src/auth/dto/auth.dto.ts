import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@/users/user-role.enum';

export class LoginDto {
  /** @example "sita.sales@example.com" */
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class RefreshTokenDto {
  /** The refresh token from login or the last refresh. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken: string;
}

export class TokenUserDto {
  id: string;
  fullName: string;
  role: UserRole;
}

export class TokenResponseDto {
  /** Send as `Authorization: Bearer <accessToken>`. */
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Works once: exchange it at /auth/refresh for a new pair. */
  refreshToken: string;
  /** Seconds until the refresh token expires. */
  refreshExpiresIn: number;
  user: TokenUserDto;
}

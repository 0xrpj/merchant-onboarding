import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '@/auth/auth-user';
import { AuthService } from '@/auth/auth.service';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Public } from '@/auth/decorators/public.decorator';
import {
  LoginDto,
  RefreshTokenDto,
  TokenResponseDto,
} from '@/auth/dto/auth.dto';
import { UserDto } from '@/users/dto/user.dto';
import { UsersService } from '@/users/users.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** Email and password in, access + refresh token out. Rate-limited per IP. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiTooManyRequestsResponse({
    description: 'Too many attempts (RATE_LIMITED)',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  /** Swap a refresh token for a new pair. Each refresh token works once. Rate-limited per IP. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiTooManyRequestsResponse({
    description: 'Too many attempts (RATE_LIMITED)',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Ends the session (the refresh token's whole family). Always 204. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  /** The logged-in user. */
  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    const fresh = await this.users.findById(user.id);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: fresh?.isActive ?? false,
    };
  }
}

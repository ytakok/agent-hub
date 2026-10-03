import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import type { UsernameLoginRequest, UsernameLoginResponse } from '@agency-hub/shared';
import { Public } from '../common/decorators/index.js';
import { AuthService } from './auth.service.js';

class UsernameLoginDto implements UsernameLoginRequest {
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/) username!: string;
  @IsString() @Length(1, 128) password!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: UsernameLoginDto): Promise<UsernameLoginResponse> {
    return this.authService.loginWithUsername(dto.username, dto.password);
  }
}

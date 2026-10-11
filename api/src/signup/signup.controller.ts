import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, Length, Matches, MaxLength } from 'class-validator';
import type { EmailOtpStatus, Locale, SignupCompleteRequest, SignupCompleteResponse, SignupStartRequest } from '@agency-hub/shared';
import { Public } from '../common/decorators/index.js';
import { UsersModule } from '../users/users.module.js';
import { SignupService } from './signup.service.js';

const LOCALES: Locale[] = ['he', 'en'];
const USERNAME = /^[a-zA-Z0-9._-]{3,30}$/;

class SignupStartDto implements SignupStartRequest {
  @IsEmail() @MaxLength(254) email!: string;
  @Matches(USERNAME, { message: 'username must be 3-30 letters, digits, dot, dash or underscore' }) username!: string;
  @IsIn(LOCALES) language!: Locale;
}

class SignupCompleteDto implements SignupCompleteRequest {
  @IsEmail() @MaxLength(254) email!: string;
  @Matches(/^\d{6}$/, { message: 'otp_invalid' }) code!: string;
  @IsString() @Length(10, 128) password!: string;
  @IsString() @Length(2, 80) displayName!: string;
  @Matches(USERNAME) username!: string;
  @IsString() @Length(2, 80) companyName!: string;
  @IsIn(LOCALES) language!: Locale;
}

/** Public: the caller has no account yet. Rate limited per IP on top of the per-code attempt limit. */
@ApiTags('auth')
@Controller('auth/signup')
@Public()
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Post('start')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(@Body() dto: SignupStartDto): Promise<EmailOtpStatus> {
    return this.signup.start(dto);
  }

  @Post('complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  complete(@Body() dto: SignupCompleteDto): Promise<SignupCompleteResponse> {
    return this.signup.complete(dto);
  }
}

@Module({ imports: [UsersModule], controllers: [SignupController], providers: [SignupService] })
export class SignupModule {}

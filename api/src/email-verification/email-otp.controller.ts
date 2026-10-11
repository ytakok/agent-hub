import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, Matches } from 'class-validator';
import type { EmailOtpStatus, Locale, SendEmailOtpRequest, VerifyEmailOtpRequest } from '@agency-hub/shared';
import { AllowNoTenant, AllowUnverifiedEmail, CurrentUser } from '../common/decorators/index.js';
import type { RequestUser } from '../common/request-user.js';
import { EmailOtpService } from './email-otp.service.js';

class SendEmailOtpDto implements SendEmailOtpRequest {
  @IsIn(['he', 'en']) language!: Locale;
}

class VerifyEmailOtpDto implements VerifyEmailOtpRequest {
  @Matches(/^\d{6}$/, { message: 'otp_invalid' }) code!: string;
}

/** Signed-in user confirms their own email; the uid always comes from the verified token. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/email-otp')
@AllowNoTenant()
@AllowUnverifiedEmail()
export class EmailOtpController {
  constructor(private readonly otp: EmailOtpService) {}

  @Post('send')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  send(@CurrentUser() user: RequestUser, @Body() dto: SendEmailOtpDto): Promise<EmailOtpStatus> {
    return this.otp.send(user.uid, dto.language);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentUser() user: RequestUser, @Body() dto: VerifyEmailOtpDto): Promise<EmailOtpStatus> {
    return this.otp.verify(user.uid, dto.code);
  }
}

@Module({ controllers: [EmailOtpController], providers: [EmailOtpService] })
export class EmailOtpModule {}

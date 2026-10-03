import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { BootstrapUserRequest, Locale, UserProfile } from '@agency-hub/shared';
import { AllowNoTenant, CurrentUser } from '../common/decorators/index.js';
import type { RequestUser } from '../common/request-user.js';
import { UsersService } from './users.service.js';

const LOCALES: Locale[] = ['he', 'en'];

class BootstrapUserDto implements BootstrapUserRequest {
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/, { message: 'username must be 3-30 letters, digits, dot, dash or underscore' })
  username!: string;
  @IsString() @Length(2, 80) displayName!: string;
  @IsIn(LOCALES) language!: Locale;
  @IsOptional() @IsString() @Length(16, 128) inviteCode?: string;
  @IsOptional() @IsString() @Length(2, 80) companyName?: string;
}

class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 80) displayName?: string;
  @IsOptional() @Matches(/^\+?[0-9 -]{7,20}$/) phone?: string;
  @IsOptional() @IsIn(LOCALES) language?: Locale;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('bootstrap')
  @AllowNoTenant()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  bootstrap(@CurrentUser() user: RequestUser, @Body() dto: BootstrapUserDto): Promise<UserProfile> {
    return this.users.bootstrap(user, dto);
  }

  /** 404 means the account exists in Firebase Auth but has not completed onboarding. */
  @Get('me')
  @AllowNoTenant()
  me(@CurrentUser() user: RequestUser): Promise<UserProfile> {
    return this.users.getProfile(user.uid);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto): Promise<UserProfile> {
    return this.users.updateProfile(user.uid, dto);
  }
}

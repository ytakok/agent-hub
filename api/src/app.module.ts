import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { Customer360Module } from './customer-360/customer-360.controller.js';
import { CustomersModule } from './customers/customers.controller.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FeatureGuard } from './feature-flags/feature.guard.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { MessagesModule } from './messages/messages.controller.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        // Never log credentials or tokens.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'res.headers["set-cookie"]', '*.customToken', '*.idToken'],
          censor: '[redacted]',
        },
        transport: process.env['NODE_ENV'] === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        serializers: {
          req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    FirebaseModule,
    FeatureFlagsModule,
    IntegrationsModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    DashboardModule,
    CustomersModule,
    Customer360Module,
    MessagesModule,
  ],
  providers: [
    // Order matters: rate limit → authenticate → tenant → role → feature flag.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useExisting: FeatureGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

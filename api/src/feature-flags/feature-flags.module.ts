import { Global, Module } from '@nestjs/common';
import { FeatureGuard } from './feature.guard.js';
import { TenantConfigService } from './tenant-config.service.js';

@Global()
@Module({
  providers: [TenantConfigService, FeatureGuard],
  exports: [TenantConfigService, FeatureGuard],
})
export class FeatureFlagsModule {}

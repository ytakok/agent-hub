import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, MaxLength } from 'class-validator';
import { NoAudit, PlatformAdminOnly } from '../common/decorators/index.js';
import { AppConfig } from '../config/app-config.service.js';
import { N8nApiClient } from './n8n-api.client.js';
import {
  N8N_API,
  N8nCredentialsService,
  type CredentialImport,
  type CredentialPreview,
} from './n8n-credentials.service.js';

export class ConnectionSheetDto {
  /** Used in credential names, e.g. "Acme – Gmail". */
  @IsString() @Length(1, 60) customerName!: string;
  /** The text the customer copied from the /connect page. */
  @IsString() @MaxLength(20_000) sheet!: string;
}

/**
 * Platform operators paste a customer's connection sheet; the API creates the matching n8n credentials.
 * The sheet contains secrets: it is never stored or logged (the audit log records only the route).
 */
@ApiTags('n8n-credentials')
@ApiBearerAuth()
@Controller('n8n-credentials')
@PlatformAdminOnly()
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class N8nCredentialsController {
  constructor(private readonly credentials: N8nCredentialsService) {}

  /** Dry run: what would be created, with values masked and n8n's required fields checked. */
  @Post('preview')
  @HttpCode(200)
  @NoAudit()
  preview(@Body() dto: ConnectionSheetDto): Promise<CredentialPreview> {
    return this.credentials.preview(dto.sheet, dto.customerName);
  }

  /** Creates the credentials in n8n. Running it twice creates duplicates. */
  @Post('import')
  import(@Body() dto: ConnectionSheetDto): Promise<CredentialImport> {
    return this.credentials.import(dto.sheet, dto.customerName);
  }
}

@Module({
  controllers: [N8nCredentialsController],
  providers: [
    N8nCredentialsService,
    {
      provide: N8N_API,
      inject: [AppConfig],
      useFactory: (config: AppConfig): N8nApiClient | null => {
        const base = config.get('N8N_BASE_URL');
        const key = config.get('N8N_API_KEY');
        return base && key ? new N8nApiClient(base, key) : null;
      },
    },
  ],
  exports: [N8nCredentialsService],
})
export class N8nCredentialsModule {}

import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { Message, MessageChannel, Paginated } from '@agency-hub/shared';
import { CurrentUser, RequireFeature } from '../common/decorators/index.js';
import { PageQueryDto } from '../common/pagination.js';
import type { TenantUser } from '../common/request-user.js';
import { TenantConfigService } from '../feature-flags/tenant-config.service.js';
import { GMAIL_PROVIDER, WHATSAPP_PROVIDER, type GmailProvider, type WhatsAppProvider } from '../integrations/provider.types.js';

class MessagesQuery extends PageQueryDto {
  @IsOptional() @IsIn(['gmail', 'whatsapp']) channel?: MessageChannel;
}

/** Unified inbox: merges every enabled messaging channel, newest first. */
@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
@RequireFeature('module.messages')
export class MessagesController {
  constructor(
    private readonly tenantConfig: TenantConfigService,
    @Inject(GMAIL_PROVIDER) private readonly gmail: GmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  @Get()
  async list(@CurrentUser() user: TenantUser, @Query() q: MessagesQuery): Promise<Paginated<Message>> {
    const { features } = await this.tenantConfig.getRuntimeConfig(user.tenantId);
    const ctx = { tenantId: user.tenantId, locale: q.lang };
    const wantGmail = features['integration.gmail'] && (!q.channel || q.channel === 'gmail');
    const wantWa = features['integration.whatsapp'] && (!q.channel || q.channel === 'whatsapp');
    const [mail, wa] = await Promise.all([
      wantGmail ? this.gmail.listCustomerMessages(ctx, 200) : [],
      wantWa ? this.whatsapp.listRequests(ctx, 200) : [],
    ]);
    const s = q.search?.toLowerCase();
    const all = [...mail, ...wa]
      .filter((m) => !s || m.fromName.toLowerCase().includes(s) || m.snippet.toLowerCase().includes(s))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize, total: all.length };
  }
}

@Module({ controllers: [MessagesController] })
export class MessagesModule {}

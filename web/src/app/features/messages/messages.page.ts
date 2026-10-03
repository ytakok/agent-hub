import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Message, MessageChannel, Paginated } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';

/** Unified inbox across enabled channels. */
@Component({
  selector: 'ah-messages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RelativeTimePipe, Icon],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'messages.title' | translate }}</h1>
        @if (result(); as r) {
          <p>{{ 'messages.count' | translate: { count: r.total } }}</p>
        }
      </div>
    </header>

    <div class="filters" role="tablist">
      @for (c of channels(); track c) {
        <button type="button" role="tab" class="btn" [class.primary]="channel() === c" [class.ghost]="channel() !== c" [attr.aria-selected]="channel() === c" (click)="channel.set(c)">
          {{ 'messages.channels.' + c | translate }}
        </button>
      }
    </div>

    <ul class="list" [attr.aria-busy]="messages.isLoading()">
      @for (m of result()?.items ?? []; track m.id) {
        <li>
          <span class="avatar" [style.color]="m.channel === 'whatsapp' ? '#25d366' : '#ea4335'" aria-hidden="true">
            <ah-icon [name]="m.channel === 'whatsapp' ? 'whatsapp' : 'mail'" />
          </span>
          <div class="main">
            <strong>{{ m.fromName }}{{ m.subject ? ' — ' + m.subject : '' }}</strong>
            <span class="muted">{{ m.snippet }}</span>
          </div>
          <div class="side">
            <span class="badge" [class.primary]="m.status === 'new'">{{ 'messageStatus.' + m.status | translate }}</span>
            <span class="muted">{{ m.receivedAt | relTime: language.intlLocale() }}</span>
          </div>
        </li>
      } @empty {
        @if (!messages.isLoading()) {
          <li class="empty">{{ 'common.empty' | translate }}</li>
        }
      }
    </ul>
  `,
  styleUrl: '../../shared/list-page.less',
})
export class MessagesPage {
  protected readonly language = inject(LanguageService);
  private readonly tenantConfig = inject(TenantConfigService);

  protected readonly channel = signal<'all' | MessageChannel>('all');
  protected readonly channels = computed(() => {
    const list: ('all' | MessageChannel)[] = ['all'];
    if (this.tenantConfig.isEnabled('integration.whatsapp')) list.push('whatsapp');
    if (this.tenantConfig.isEnabled('integration.gmail')) list.push('gmail');
    return list;
  });

  protected readonly messages = httpResource<Paginated<Message>>(() => ({
    url: `${environment.apiBaseUrl}/messages`,
    params: { pageSize: 50, lang: this.language.lang(), ...(this.channel() !== 'all' ? { channel: this.channel() } : {}) },
  }));
  protected readonly result = computed(() => (this.messages.hasValue() ? this.messages.value() : null));
}

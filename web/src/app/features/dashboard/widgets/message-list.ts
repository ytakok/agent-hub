import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DashboardSummary, Message } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { RelativeTimePipe } from '../../../shared/pipes/format.pipes';
import { WidgetCard } from '../../../shared/ui/widget-card';
import { blockState, dataOf } from './block-state';

type Channel = 'whatsapp' | 'gmail';

/** Customer requests from one channel, with SLA status. Used for both WhatsApp and Gmail. */
@Component({
  selector: 'ah-message-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, TranslatePipe, RelativeTimePipe],
  template: `
    <ah-widget-card
      [title]="'widgets.' + channel() + '.title' | translate"
      [icon]="channel() === 'whatsapp' ? 'whatsapp' : 'mail'"
      [accent]="channel() === 'whatsapp' ? '#25d366' : '#ea4335'"
      [state]="state()"
      [emptyText]="'widgets.messages.empty' | translate"
    >
      <span slot="badge" class="counters">
        @if (counters(); as c) {
          <span class="badge primary">{{ c.open }} {{ 'widgets.messages.open' | translate }}</span>
          @if (c.overdue) {
            <span class="badge danger">{{ c.overdue }} {{ 'widgets.messages.overdue' | translate }}</span>
          }
        }
      </span>
      <ul>
        @for (m of messages(); track m.id) {
          <li>
            <span class="avatar" aria-hidden="true">{{ m.fromName.charAt(0) }}</span>
            <div class="content">
              <div class="top">
                <strong>{{ m.fromName }}</strong>
                <time [attr.datetime]="m.receivedAt">{{ m.receivedAt | relTime: language.intlLocale() }}</time>
              </div>
              @if (m.subject) {
                <span class="subject">{{ m.subject }}</span>
              }
              <span class="snippet">{{ m.snippet }}</span>
              <div class="meta">
                <span class="badge">{{ 'messageStatus.' + m.status | translate }}</span>
                @if (sla(m); as s) {
                  <span class="badge" [class.danger]="s === 'overdue'" [class.warning]="s === 'soon'">{{ 'widgets.messages.sla.' + s | translate }}</span>
                }
              </div>
            </div>
          </li>
        }
      </ul>
    </ah-widget-card>
  `,
  styleUrl: './message-list.less',
})
export class MessageList {
  protected readonly language = inject(LanguageService);
  readonly channel = input.required<Channel>();
  readonly whatsapp = input<DashboardSummary['whatsapp']>();
  readonly gmail = input<DashboardSummary['gmail']>();
  readonly loading = input(false);

  private readonly block = computed(() => (this.channel() === 'whatsapp' ? this.whatsapp() : this.gmail()));
  protected readonly state = computed(() =>
    blockState<{ messages: Message[] }>(this.block(), this.loading(), (d) => !d.messages.length),
  );
  protected readonly messages = computed(() => dataOf<{ messages: Message[] }>(this.block())?.messages ?? []);
  protected readonly counters = computed(() => {
    const wa = dataOf(this.whatsapp());
    const gm = dataOf(this.gmail());
    if (this.channel() === 'whatsapp') return wa ? { open: wa.pending, overdue: wa.overdue } : null;
    return gm ? { open: gm.unread, overdue: 0 } : null;
  });

  protected sla(m: Message): 'overdue' | 'soon' | null {
    if (!m.slaDueAt || m.status === 'replied' || m.status === 'closed') return null;
    const left = new Date(m.slaDueAt).getTime() - Date.now();
    if (left < 0) return 'overdue';
    return left < 3_600_000 ? 'soon' : null;
  }
}

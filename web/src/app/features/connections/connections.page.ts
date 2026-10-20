import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon, type IconName } from '../../shared/ui/icon';

type ProviderId = 'gmail' | 'googleSheets' | 'firebase' | 'hubspot' | 'gemini';

interface ProviderDef {
  id: ProviderId;
  /** oauth = "Sign in with …" popup; apiKey = the customer pastes a key. */
  kind: 'oauth' | 'apiKey';
  icon: IconName;
  /** CSS color for the icon tile. */
  color: string;
  fields?: { name: string; placeholder: string }[];
}

/** Add a service here + in the n8n workflow's `P` map (same id). Texts: i18n `connections.providers.<id>`. */
const PROVIDERS: ProviderDef[] = [
  { id: 'gmail', kind: 'oauth', icon: 'mail', color: '#ea4335' },
  { id: 'googleSheets', kind: 'oauth', icon: 'sheet', color: '#0f9d58' },
  { id: 'firebase', kind: 'oauth', icon: 'database', color: '#f57c00' },
  { id: 'hubspot', kind: 'apiKey', icon: 'crm', color: '#ff7a59', fields: [{ name: 'appToken', placeholder: 'pat-eu1-…' }] },
  { id: 'gemini', kind: 'apiKey', icon: 'key', color: '#4285f4', fields: [{ name: 'apiKey', placeholder: 'AIza…' }] },
];

interface ProviderStatus {
  connected: boolean;
  credentialId: string | null;
  updatedAt: string | null;
}
interface StatusResponse {
  ok: true;
  providers: Partial<Record<ProviderId, ProviderStatus>>;
}
interface Notice {
  type: 'success' | 'error' | 'info';
  key: string;
  params?: Record<string, string>;
  detail?: string;
}

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60_000;

/**
 * "Connections": the customer links Google / HubSpot / Gemini without ever opening n8n.
 * Talks to one n8n webhook (n8n/connections-api.workflow.json), which creates the n8n credentials.
 */
@Component({
  selector: 'ah-connections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, Icon, RelativeTimePipe],
  templateUrl: './connections.page.html',
  styleUrl: './connections.page.less',
})
export class ConnectionsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly url = environment.connectionsApiUrl;

  protected readonly providers = PROVIDERS;
  protected readonly configured = Boolean(this.url);

  protected readonly status = signal<StatusResponse['providers'] | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly busy = signal<ProviderId | null>(null);
  protected readonly waiting = signal<ProviderId | null>(null);
  protected readonly openForm = signal<ProviderId | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  /** Key fields being typed, per provider. Never stored anywhere else. */
  protected readonly values: Record<string, Record<string, string>> = {};

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    for (const p of PROVIDERS) this.values[p.id] = {};
    if (this.configured) void this.refresh();
    inject(DestroyRef).onDestroy(() => this.stopWaiting());
  }

  protected state(id: ProviderId): ProviderStatus | undefined {
    return this.status()?.[id];
  }

  protected async refresh(silent = false): Promise<StatusResponse['providers'] | null> {
    if (!silent) this.loading.set(true);
    try {
      const r = await this.call<StatusResponse>({ action: 'status' });
      this.status.set(r.providers);
      this.loadError.set(false);
      return r.providers;
    } catch (e) {
      if (!silent) {
        this.loadError.set(true);
        this.showError(e);
      }
      return null;
    } finally {
      if (!silent) this.loading.set(false);
    }
  }

  /** OAuth: open the popup first (inside the click, so it isn't blocked), then point it at the consent screen. */
  protected async connectOAuth(p: ProviderDef): Promise<void> {
    this.notice.set(null);
    const popup = window.open('about:blank', 'ah-connect', 'popup,width=520,height=720');
    this.busy.set(p.id);
    try {
      const r = await this.call<{ url: string }>({ action: 'start', provider: p.id });
      if (popup && !popup.closed) popup.location.href = r.url;
      else window.open(r.url, '_blank', 'noopener');
      this.waitFor(p.id);
    } catch (e) {
      popup?.close();
      this.showError(e);
    } finally {
      this.busy.set(null);
    }
  }

  protected toggleForm(id: ProviderId): void {
    this.notice.set(null);
    this.openForm.set(this.openForm() === id ? null : id);
  }

  protected async saveKey(p: ProviderDef): Promise<void> {
    const fields = this.values[p.id];
    if (p.fields?.some((f) => !fields[f.name]?.trim())) {
      this.notice.set({ type: 'error', key: 'connections.errors.missing_field' });
      return;
    }
    this.busy.set(p.id);
    this.notice.set(null);
    try {
      await this.call({ action: 'saveKey', provider: p.id, fields });
      this.values[p.id] = {};
      this.openForm.set(null);
      this.notice.set({ type: 'success', key: 'connections.connected', params: { name: `connections.providers.${p.id}.name` } });
      await this.refresh(true);
    } catch (e) {
      this.showError(e);
    } finally {
      this.busy.set(null);
    }
  }

  protected async disconnect(p: ProviderDef): Promise<void> {
    this.busy.set(p.id);
    this.notice.set(null);
    try {
      await this.call({ action: 'disconnect', provider: p.id });
      await this.refresh(true);
    } catch (e) {
      this.showError(e);
    } finally {
      this.busy.set(null);
    }
  }

  protected stopWaiting(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.waiting.set(null);
  }

  /** The popup ends on n8n's "connected" page; we just poll until the credential has tokens. */
  private waitFor(id: ProviderId): void {
    this.stopWaiting();
    this.waiting.set(id);
    const started = Date.now();
    this.pollTimer = setInterval(async () => {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        this.stopWaiting();
        this.notice.set({ type: 'info', key: 'connections.timeout' });
        return;
      }
      const s = await this.refresh(true);
      if (s?.[id]?.connected && this.waiting() === id) {
        this.stopWaiting();
        this.notice.set({ type: 'success', key: 'connections.connected', params: { name: `connections.providers.${id}.name` } });
      }
    }, POLL_MS);
  }

  private async call<T>(payload: Record<string, unknown>): Promise<T> {
    const token = await this.auth.getIdToken();
    return firstValueFrom(
      this.http.post<T>(this.url, payload, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    );
  }

  private showError(e: unknown): void {
    if (!(e instanceof HttpErrorResponse)) {
      this.notice.set({ type: 'error', key: 'connections.errors.unknown' });
      return;
    }
    const body = typeof e.error === 'object' && e.error !== null ? (e.error as { error?: unknown; detail?: unknown }) : null;
    if (typeof body?.error === 'string') {
      // A real answer from the Connections API: show its specific reason.
      this.notice.set({ type: 'error', key: `connections.errors.${body.error}`, detail: typeof body.detail === 'string' ? body.detail : undefined });
    } else if (e.status === 0) {
      this.notice.set({ type: 'error', key: 'connections.errors.network' });
    } else {
      // No API answer (HTML error page): the n8n workflow isn't active/imported, or the dev proxy can't reach n8n.
      this.notice.set({ type: 'error', key: 'connections.errors.service_unavailable', detail: `HTTP ${e.status}` });
    }
  }
}

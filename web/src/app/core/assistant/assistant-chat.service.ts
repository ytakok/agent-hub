import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../i18n/language.service';

/** n8n's self-contained chat widget, pinned so an upstream release can't change the app unannounced. */
const CHAT_VERSION = '1.41.4';
const CHAT_JS = `https://cdn.jsdelivr.net/npm/@n8n/chat@${CHAT_VERSION}/dist/chat.bundle.es.js`;
const CHAT_CSS = `https://cdn.jsdelivr.net/npm/@n8n/chat@${CHAT_VERSION}/dist/style.css`;
const STYLE_ID = 'n8n-chat-style';

interface N8nChatApp {
  unmount(): void;
}
type CreateChat = (options: Record<string, unknown>) => N8nChatApp;

/**
 * Staff assistant (n8n chat) shown only inside the signed-in app — never on public pages,
 * because the workflow can read agency data. Configured by `environment.assistantChatUrl` (empty = off).
 *
 * Note: the webhook URL is still visible in the browser bundle. For real protection, route chat through
 * the API (`POST /api/assistant/chat`, auth + tenant checks, signed call to n8n) — see docs/developer-guide.md.
 */
@Injectable({ providedIn: 'root' })
export class AssistantChatService {
  private readonly document = inject(DOCUMENT);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private app: N8nChatApp | null = null;
  private mounting: Promise<void> | null = null;

  get enabled(): boolean {
    return !!environment.assistantChatUrl;
  }

  mount(): Promise<void> {
    if (!this.enabled || this.app) return Promise.resolve();
    this.mounting ??= this.load().finally(() => (this.mounting = null));
    return this.mounting;
  }

  unmount(): void {
    this.app?.unmount();
    this.app = null;
    this.document.getElementById('n8n-chat')?.remove();
  }

  private async load(): Promise<void> {
    this.ensureStyles();
    try {
      const mod = (await import(/* @vite-ignore */ CHAT_JS)) as { createChat: CreateChat };
      const t = (k: string) => this.translate.instant(`assistant.${k}`);
      // The widget localizes through its `en` strings; fill them in the user's current language.
      this.app = mod.createChat({
        webhookUrl: environment.assistantChatUrl,
        mode: 'window',
        defaultLanguage: 'en',
        // true hides the input box until a previous session loads (needs "Load Previous Session: From Memory" in n8n).
        loadPreviousSession: false,
        showWelcomeScreen: false,
        initialMessages: [t('greeting')],
        i18n: {
          en: {
            title: t('title'),
            subtitle: t('subtitle'),
            footer: '',
            getStarted: t('newChat'),
            inputPlaceholder: t('placeholder'),
          },
        },
        metadata: { lang: this.language.lang() },
      });
    } catch {
      // Widget is optional: a CDN/network failure must never break the app.
      this.app = null;
    }
  }

  private ensureStyles(): void {
    if (this.document.getElementById(STYLE_ID)) return;
    const link = this.document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = CHAT_CSS;
    this.document.head.appendChild(link);
  }
}

import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { SheetsIntegrationStatus, SheetsTestResult } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';

/**
 * Settings card for the organization's Google Sheets source.
 * Owners/admins see status and can test; only platform admins connect or disconnect a sheet
 * (one service account can read every shared sheet, so tenants must not pick arbitrary spreadsheet IDs).
 */
@Component({
  selector: 'ah-sheets-connection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, Icon, RelativeTimePipe],
  templateUrl: './sheets-connection.html',
  styleUrl: './sheets-connection.less',
})
export class SheetsConnection {
  private readonly http = inject(HttpClient);
  private readonly tenantConfig = inject(TenantConfigService);
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly api = environment.apiBaseUrl;

  protected readonly status = httpResource<SheetsIntegrationStatus>(() => `${this.api}/integrations/sheets`);
  protected readonly s = computed(() => (this.status.hasValue() ? this.status.value() : null));

  protected readonly busy = signal<'test' | 'connect' | 'disconnect' | null>(null);
  protected readonly result = signal<SheetsTestResult | null>(null);
  protected readonly copied = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    spreadsheet: ['', [Validators.required, Validators.minLength(20)]],
    sheetName: [''],
  });

  protected async copyEmail(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard blocked — the address is selectable text anyway */
    }
  }

  protected test(): Promise<void> {
    return this.run('test', () => firstValueFrom(this.http.post<SheetsTestResult>(`${this.api}/integrations/sheets/test`, {})));
  }

  protected connect(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return Promise.resolve();
    }
    const v = this.form.getRawValue();
    return this.run('connect', () =>
      firstValueFrom(
        this.http.put<SheetsTestResult>(`${this.api}/tenants/${this.tenantId()}/integrations/sheets`, {
          spreadsheet: v.spreadsheet.trim(),
          ...(v.sheetName.trim() ? { sheetName: v.sheetName.trim() } : {}),
        }),
      ),
    );
  }

  protected disconnect(): Promise<void> {
    return this.run('disconnect', async () => {
      await firstValueFrom(this.http.delete(`${this.api}/tenants/${this.tenantId()}/integrations/sheets`));
      return null;
    });
  }

  private tenantId(): string {
    return this.tenantConfig.tenant()?.id ?? '';
  }

  private async run(kind: 'test' | 'connect' | 'disconnect', action: () => Promise<SheetsTestResult | null>): Promise<void> {
    this.busy.set(kind);
    this.result.set(null);
    try {
      this.result.set(await action());
      if (kind !== 'test') this.form.reset();
    } catch {
      this.result.set({ ok: false, error: 'unknown' });
    } finally {
      this.busy.set(null);
      this.status.reload();
    }
  }
}

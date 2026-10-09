import { Global, Module, type Provider, type Type } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { GoogleSheetsClient } from './google-sheets/google-sheets.client.js';
import { SheetsAdminController, SheetsIntegrationController } from './google-sheets/sheets-integration.controller.js';
import { SheetsIntegrationService } from './google-sheets/sheets-integration.service.js';
import { TenantSheetsProvider } from './google-sheets/tenant-sheets.provider.js';
import {
  LiveCrmProvider,
  LiveCustomerRecordsProvider,
  LiveGmailProvider,
  LiveSheetsProvider,
  LiveWhatsAppProvider,
} from './live/live-providers.js';
import { MockCustomerRecordsProvider } from './mock/mock-customer-records.provider.js';
import { MockDatasetService } from './mock/mock-dataset.service.js';
import { MockCrmProvider, MockGmailProvider, MockSheetsProvider, MockWhatsAppProvider } from './mock/mock-providers.js';
import {
  CRM_PROVIDER,
  CUSTOMER_RECORDS_PROVIDER,
  GMAIL_PROVIDER,
  SHEETS_PROVIDER,
  WHATSAPP_PROVIDER,
} from './provider.types.js';

/** Binds an interface token to the mock or live implementation based on DATA_MODE. */
export function selectProvider(token: symbol, mock: Type, live: Type): Provider {
  return {
    provide: token,
    inject: [AppConfig, mock, live],
    useFactory: (config: AppConfig, m: unknown, l: unknown) => (config.isMock ? m : l),
  };
}

const implementations = [
  MockCrmProvider, MockSheetsProvider, MockGmailProvider, MockWhatsAppProvider,
  LiveCrmProvider, LiveSheetsProvider, LiveGmailProvider, LiveWhatsAppProvider,
  MockCustomerRecordsProvider, LiveCustomerRecordsProvider,
];

@Global()
@Module({
  controllers: [SheetsIntegrationController, SheetsAdminController],
  providers: [
    MockDatasetService,
    ...implementations,
    selectProvider(CRM_PROVIDER, MockCrmProvider, LiveCrmProvider),
    // Sheets is chosen per tenant (connected sheet → live), not by DATA_MODE alone.
    GoogleSheetsClient,
    SheetsIntegrationService,
    TenantSheetsProvider,
    { provide: SHEETS_PROVIDER, useExisting: TenantSheetsProvider },
    selectProvider(GMAIL_PROVIDER, MockGmailProvider, LiveGmailProvider),
    selectProvider(WHATSAPP_PROVIDER, MockWhatsAppProvider, LiveWhatsAppProvider),
    selectProvider(CUSTOMER_RECORDS_PROVIDER, MockCustomerRecordsProvider, LiveCustomerRecordsProvider),
  ],
  exports: [CRM_PROVIDER, SHEETS_PROVIDER, GMAIL_PROVIDER, WHATSAPP_PROVIDER, CUSTOMER_RECORDS_PROVIDER, SheetsIntegrationService, GoogleSheetsClient],
})
export class IntegrationsModule {}

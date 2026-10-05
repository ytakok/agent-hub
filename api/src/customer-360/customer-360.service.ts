import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Customer360, CustomerSearchRequest, CustomerSearchResponse, Locale } from '@agency-hub/shared';
import type { TenantUser } from '../common/request-user.js';
import { TenantConfigService } from '../feature-flags/tenant-config.service.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { CUSTOMER_RECORDS_PROVIDER, type CustomerRecordsProvider } from '../integrations/provider.types.js';
import { buildCustomer360 } from './customer-360.builder.js';
import { buildCriteria, maskNationalId } from './customer-search.util.js';

const MAX_HITS = 10;

@Injectable()
export class Customer360Service {
  private readonly logger = new Logger(Customer360Service.name);

  constructor(
    @Inject(CUSTOMER_RECORDS_PROVIDER) private readonly records: CustomerRecordsProvider,
    private readonly tenantConfig: TenantConfigService,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  /** Search by ID, phone, policy number (or name). Results never contain full ID numbers. */
  async search(user: TenantUser, req: CustomerSearchRequest, locale: Locale): Promise<CustomerSearchResponse> {
    const { criteria, searchedBy } = buildCriteria(req.q, req.by ?? 'auto');
    if (!searchedBy.length) return { searchedBy, hits: [] };

    const matches = await this.records.findCustomers({ tenantId: user.tenantId, locale }, criteria, MAX_HITS);
    return {
      searchedBy,
      hits: matches.map((m) => ({
        customerId: m.customer.id,
        fullName: m.customer.fullName,
        nationalIdMasked: maskNationalId(m.customer.nationalId),
        phone: m.customer.phones[0],
        city: m.customer.address?.city,
        status: m.customer.status,
        matchedOn: m.matchedOn,
        matchedPolicyNumber: m.matchedPolicyNumber,
        matchedFamilyMember: m.matchedFamilyMember,
        activePolicies: m.activePolicies,
      })),
    };
  }

  /** Full customer view. Every view of personal data is written to the tenant's audit log. */
  async getProfile(user: TenantUser, customerId: string, locale: Locale): Promise<Customer360> {
    const [bundle, cfg] = await Promise.all([
      this.records.getCustomerBundle({ tenantId: user.tenantId, locale }, customerId),
      this.tenantConfig.getRuntimeConfig(user.tenantId),
    ]);
    if (!bundle) throw new NotFoundException('Customer not found');

    this.db
      .collection(`tenants/${user.tenantId}/auditLogs`)
      .add({ actorUid: user.uid, action: 'customer.view', entity: 'Customer', entityId: customerId, at: FieldValue.serverTimestamp() })
      .catch((err: unknown) => this.logger.warn(`Audit write failed: ${String(err)}`));

    return buildCustomer360(bundle, {
      maskIds: user.role === 'viewer',
      renewalWindowDays: cfg.settings.renewalWindowDays,
      system: this.records.system,
    });
  }
}

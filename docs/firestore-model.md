# Firestore data model

Types live in `shared/src/index.ts`. All writes go through the API (Admin SDK). Client reads are limited by `firestore.rules`.

```
users/{uid}                          UserProfile: email, username, displayName, tenantId, role, status,
                                     authProviders[], preferences{language, dashboardLayout}, timestamps
usernames/{usernameLower}            { uid }: uniqueness + username login (server-only)

featureFlags/{key}                   FeatureFlagDefinition: description, defaultEnabled, plans[]   (global)

tenants/{tenantId}                   Tenant: name, slug, plan, status, timezone, currency,
                                     locales{default, supported[]}, branding{logoUrl, colors, font, radius}
  config/features                    { overrides: { [FeatureKey]: boolean }, updatedAt, updatedBy }
  config/settings                    TenantSettings: renewalWindowDays, messageSlaHours, workingHours,
                                     defaultAssigneeUid, dashboardWidgets[]
  members/{uid}                      { role, joinedAt }
  invitations/{id}                   { email, role, codeHash (sha256), status, expiresAt, invitedBy }
  integrations/{source}              { status, connectedBy, connectedAt, lastSyncAt, lastError,
                                       config{non-secret}, secretRef }   ← secrets live in Secret Manager
  customers/{id}                     Customer
  leads/{id}                         Lead
  policies/{id}                      Policy (renewalDate drives the renewals widget)
  claims/{id}                        { policyId, customerId, type, amount, status, openedAt, history[] }
  messages/{id}                      Message: channel gmail|whatsapp, status, slaDueAt, externalId
  tasks/{id}                         { title, relatedTo{type,id}, assignedTo, dueAt, priority, status }
  sheetRecords/{id}                  SheetRecord
  syncLogs/{id}                      { source, startedAt, finishedAt, itemsIn, errors[], n8nExecutionId }
  dashboardStats/{yyyy-mm-dd}        pre-aggregated KPIs (written by API/n8n; cheap dashboard reads)
  notifications/{id}                 { userId, type, payload, readAt }
  auditLogs/{id}                     { actorUid, action, entity, ip, userAgent, at }   (append-only)
```

## Custom claims (set by the API only)
`{ tenantId: string, role: 'owner'|'admin'|'agent'|'viewer', platformAdmin?: true }`

The client must refresh its ID token after a claim changes (`AuthService.bootstrap` does this).

## Effective feature flags
`tenantOverride ?? (definition.defaultEnabled && (no plans || plan ∈ plans))`

This is resolved in `TenantConfigService` (API) with a 30-second cache, and served at `GET /api/tenants/current/config`.

## Indexes
See `firestore.indexes.json`. It covers messages by status or channel + `receivedAt`, policies by status + `renewalDate`, customers by assignee, leads by stage, and the invitations collection-group lookup.

## Privacy
- Store only what the agency needs. Consider hashing national ID numbers (`nationalIdHash`).
- Record marketing consent per customer.
- Audit logs are append-only and readable only by owners and admins.

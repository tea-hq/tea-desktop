# Multi-Tenant Enterprise Onboarding And Desktop Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a public, multi-tenant Tea Center where enterprises apply, platform administrators approve them, enterprise administrators configure tenant OIDC plus manually managed IM/model settings, and Tea Desktop signs in by enterprise domain with device-bound local recovery.

**Architecture:** Extend `tea-center` as a modular control-plane monolith rather than creating another authentication service. PostgreSQL owns tenant, identity, onboarding, configuration, and session facts; secret values are encrypted behind a server-only `SecretStore`. `tea-center-frontend` is rebuilt as a Vue 3 + Vite + TailwindCSS operations UI, while `tea-desktop` performs OIDC handoff, token exchange, refresh, and secret storage only in its Rust host.

**Tech Stack:** Go 1.26, Gin, PostgreSQL, pgx, SQL migrations, Vue 3, TypeScript, Vite 8, TailwindCSS 4, Pinia, Vue Router, vue-i18n, Vitest, Vue Test Utils, Playwright, Tauri 2, Rust, rusqlite, OS keyring, Ed25519.

---

## Product Decisions Fixed By This Plan

1. The first release uses assisted onboarding: an enterprise submits a public application, a Tea platform administrator approves it, and Center creates a single-use onboarding grant that is delivered out of band. Email delivery is deferred behind a future notifier port.
2. The enterprise does not choose an arbitrary callback URL in Center. Center displays its canonical callback URL; the enterprise administrator copies it into the enterprise IdP and then enters the IdP issuer/client configuration in Center.
3. The platform administrator continues to authenticate through the deployment-wide platform OIDC configuration. Tenant users authenticate through the OIDC connection selected by their approved enterprise domain.
4. A stable tenant user is keyed by `(oidc_connection_id, issuer, subject)`. Email is display/contact data and never an identity key or tenant selector.
5. Batch 3 stores tenant IM `appKey` and `appSecret` for future server-side account provisioning. It does not create IM applications or user accounts automatically.
6. Batch 3 stores model provider metadata and optional server-side credentials manually. Batch 4 sends only safe catalog metadata to Desktop. Raw model provider secrets are not delivered until an endpoint-bound credential-delivery ADR is approved.
7. Batch 4 completes Center authentication and bootstrap in Desktop. It does not claim automatic IM login because per-user IM account provisioning is deliberately deferred.
8. A refresh credential and device private key are stored in the OS credential facility. Access tokens and handoff verifiers remain memory-only. Safe tenant/config projections are cached in SQLite; secrets never enter Vue, localStorage, settings JSON, logs, or conversation state.
9. Cached IM credentials alone cannot provide offline message history. Future offline reading requires a bounded local message repository and an explicit retention/encryption policy.
10. Public SaaS and private deployment use the same schema and APIs. A private deployment normally has one active tenant and can hide tenant discovery through deployment configuration without adding a second authentication implementation.

## Experience Ladder

| Batch                      | User who can try it        | Demonstrable result                                                                                                                                                                                            |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Apply and approve       | Tea platform administrator | Review a submitted enterprise, approve/reject it, and generate/rotate a one-time onboarding link.                                                                                                              |
| 2. Configure tenant OIDC   | Enterprise administrator   | Submit an application, open the approved onboarding link, copy the callback URL, configure OIDC, test login, and become the first tenant administrator.                                                        |
| 3. Configure IM and models | Tea platform administrator | Open a tenant detail page and manually save redacted IM and model provider configuration with an auditable revision.                                                                                           |
| 4. Sign in from Desktop    | Enterprise employee        | Enter an enterprise domain, fail clearly for an unknown domain, complete browser OIDC for a known tenant, return through a bounded loopback callback, and reopen Desktop with a cached scoped session/profile. |

## Target Data Ownership

```text
PostgreSQL / Tea Center
  enterprise application and review
  tenant and verified domains
  OIDC connection metadata and secret references
  external identity and tenant membership
  browser/OIDC/desktop transactions and sessions
  IM application configuration
  model provider catalog
  endpoint configuration revision
  audit events

Server SecretStore
  tenant OIDC client secrets
  IM app secrets
  model provider credentials

Desktop OS credential facility
  device private key
  Center refresh credential
  future per-user IM token
  future endpoint-delivered provider credential

Desktop SQLite
  Center origin
  tenant/user safe profile
  endpoint id and last configuration revision
  non-secret IM/model catalog projection
  cache timestamps and expiry metadata
```

## API Surface At Completion

```text
Public
  POST /v1/enterprise-applications
  GET  /v1/enterprise-directory/resolve?domain=example.com

Platform administration
  GET  /v1/admin/enterprise-applications
  GET  /v1/admin/enterprise-applications/:applicationID
  POST /v1/admin/enterprise-applications/:applicationID/approve
  POST /v1/admin/enterprise-applications/:applicationID/reject
  POST /v1/admin/enterprise-applications/:applicationID/onboarding-grants
  GET  /v1/admin/tenants
  GET  /v1/admin/tenants/:tenantID
  PUT  /v1/admin/tenants/:tenantID/im-configuration
  GET  /v1/admin/tenants/:tenantID/model-providers
  POST /v1/admin/tenants/:tenantID/model-providers
  PATCH /v1/admin/tenants/:tenantID/model-providers/:providerID

Enterprise onboarding
  GET  /v1/onboarding/context
  PUT  /v1/onboarding/oidc-connection
  POST /v1/onboarding/oidc-test
  GET  /auth/tenant/oidc/login
  GET  /auth/oidc/callback

Desktop
  POST   /v1/desktop-logins
  POST   /v1/endpoint-sessions/exchange
  POST   /v1/endpoint-sessions/refresh
  DELETE /v1/endpoint-sessions/current
  GET    /v1/endpoint/bootstrap
```

The onboarding token is sent in an `Authorization: Onboarding <token>` header. The browser link carries the token in the URL fragment, `/onboarding#token=...`; the SPA moves it to memory and immediately clears the fragment so gateway logs and referrers do not receive it.

---

# Batch 1: Enterprise Application And Platform Approval

## Batch 1 Exit Experience

1. A deterministic API fixture or `curl` submits an enterprise application.
2. A platform administrator signs into the rebuilt Center frontend.
3. The administrator opens the Applications queue, reviews the company/domain/contact, and approves or rejects it.
4. Approval atomically creates a pending tenant and verified-domain reservation.
5. The administrator generates a one-time onboarding link, copies it, rotates it, and sees an audit trail without ever seeing an old token again.

### Task 1.1: Record The Control-Plane Contracts

**Files:**

- Create: `../tea-center/docs/adr/0001-multi-tenant-control-plane.md`
- Create: `../tea-center/docs/protocol/enterprise-onboarding-v1.md`
- Modify: `../tea-center/docs/protocol/desktop-auth.md`
- Create: `docs/adr/0014-center-endpoint-bootstrap.md`

**Steps:**

1. Document the assisted onboarding decision, platform-admin versus tenant-admin authentication, PostgreSQL ownership, secret encryption, status transitions, rollback, backup, and private-deployment behavior.
2. Define application states `submitted | approved | rejected` and tenant states `onboarding | active | suspended` without compatibility aliases.
3. Define that approval is idempotent and transactional; two concurrent approvals may create only one tenant.
4. Define generic error codes: `invalid_input`, `conflict`, `not_found`, `unauthenticated`, `authorization_denied`, `expired`, and `rate_limited`.
5. Review the ADR before implementation. Do not commit without explicit user instruction.

### Task 1.2: Add PostgreSQL And Migrations

**Files:**

- Modify: `../tea-center/go.mod`
- Modify: `../tea-center/go.sum`
- Create: `../tea-center/internal/postgres/database.go`
- Create: `../tea-center/internal/postgres/migrate.go`
- Create: `../tea-center/internal/postgres/migrations/0001_control_plane.sql`
- Create: `../tea-center/internal/postgres/migrate_test.go`
- Create: `../tea-center/cmd/center-migrate/main.go`
- Modify: `../tea-center/Containerfile`
- Modify: `../tea-center/deploy/local/compose.yaml`
- Modify: `../tea-center/deploy/production/compose.yaml`
- Modify: `../tea-center/.env.example`
- Modify: `../tea-center/.env.production.example`

**Schema:**

- `enterprise_applications`
- `tenants`
- `tenant_domains`
- `onboarding_grants`
- `users`
- `external_identities`
- `tenant_memberships`
- `oidc_connections`
- `audit_events`
- Persistent auth/session tables added in Batch 2
- Configuration tables added in Batch 3

**Steps:**

1. Add pgx and a migration library; expose a pool rather than `database/sql` throughout domain code.
2. Write the failing migration integration test against `CENTER_TEST_DATABASE_URL`.
3. Add unique constraints for normalized domain, tenant slug, external identity, and onboarding grant hash.
4. Add optimistic `version` columns and timestamps in UTC.
5. Build a one-shot migration command and run it before the API in Compose.
6. Add PostgreSQL to local Compose with a health check and persistent volume.
7. Run `go test ./internal/postgres -run TestMigrations -count=1` and verify a clean database reaches schema version 1.

### Task 1.3: Implement Enterprise Application Ownership

**Files:**

- Create: `../tea-center/internal/enterprise/types.go`
- Create: `../tea-center/internal/enterprise/store.go`
- Create: `../tea-center/internal/enterprise/service.go`
- Create: `../tea-center/internal/enterprise/postgres_store.go`
- Create: `../tea-center/internal/enterprise/service_test.go`
- Create: `../tea-center/internal/enterprise/postgres_store_test.go`

**Behavior:**

```text
SubmitApplication
  normalize company/domain/contact
  reject duplicate active or pending domain
  create submitted application

ApproveApplication
  lock application row
  create tenant + domain reservation once
  create audit event

RejectApplication
  require reason
  keep immutable review history

IssueOnboardingGrant
  require approved application
  hash random token at rest
  invalidate prior live grant
  return plaintext exactly once
```

**Steps:**

1. Write table-driven tests for normalization, invalid domains, duplicate applications, state transitions, and concurrent approval.
2. Implement domain types without Gin or JSON tags.
3. Implement the service against an in-memory fake store first.
4. Implement PostgreSQL transactions and `SELECT ... FOR UPDATE` for approval/grant rotation.
5. Add tests proving tenant A cannot load or mutate tenant B records through scoped store methods.
6. Run `go test ./internal/enterprise -race`.

### Task 1.4: Add Platform Administration APIs

**Files:**

- Create: `../tea-center/internal/protocol/v1/enterprise_applications.go`
- Create: `../tea-center/internal/httpapi/enterprise_applications.go`
- Create: `../tea-center/internal/httpapi/enterprise_applications_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/app/app.go`
- Modify: `../tea-center/cmd/center/main.go`

**Steps:**

1. Write strict DTO validation and bounded fields before registering routes.
2. Require the existing platform browser session plus `AdminAuthorizer` for every `/v1/admin/...` route.
3. Return only safe application/contact/status metadata.
4. Return the onboarding URL only from a successful create/rotate response; list/detail responses expose `grantActive` and `grantExpiresAt`, never the token.
5. Add request tests for unauthenticated, unauthorized, invalid, duplicate, concurrent approval, and secret/token redaction cases.
6. Run `go test ./internal/httpapi -run EnterpriseApplication -race`.

### Task 1.5: Rebuild The Center Frontend Foundation

**Files:**

- Modify: `../tea-center-frontend/package.json`
- Modify: `../tea-center-frontend/pnpm-lock.yaml`
- Modify: `../tea-center-frontend/vite.config.ts`
- Modify: `../tea-center-frontend/src/main.ts`
- Replace: `../tea-center-frontend/src/App.vue`
- Replace: `../tea-center-frontend/src/styles.css`
- Create: `../tea-center-frontend/src/app/router.ts`
- Create: `../tea-center-frontend/src/app/AppShell.vue`
- Create: `../tea-center-frontend/src/app/navigation.ts`
- Refactor: `../tea-center-frontend/src/api.ts`
- Refactor: `../tea-center-frontend/src/i18n.ts`
- Create: `../tea-center-frontend/src/test/setup.ts`

**Dependencies:**

- `tailwindcss@4`
- `@tailwindcss/vite@4`
- `vue-router@4`
- `pinia`
- `lucide-vue-next`
- `vitest`
- `@vue/test-utils`
- `happy-dom`
- `@playwright/test`

**Design direction:**

- Quiet, utilitarian control plane for repeated operations.
- Light theme with white primary canvas and gray secondary navigation.
- Dense queue/detail layout, no marketing hero, decorative gradients, nested cards, or excessive rounding.
- Left navigation: `Applications`, `Tenants`, `Operations` placeholder only if a real route exists.
- Compact status badges, icon buttons with tooltips, explicit loading/empty/error states.
- All display text remains in `src/i18n.ts`; Simplified Chinese stays the complete baseline locale.

**Steps:**

1. Add Tailwind through the Vite plugin and import it from `src/styles.css`.
2. Add Vue Router and Pinia at composition root.
3. Replace the single Connector page with a route shell; preserve connector management only as a separate route if still required.
4. Add Vitest scripts `test` and `test:run`.
5. Add route/auth-shell tests before page implementation.
6. Run `pnpm test:run && pnpm type-check && pnpm build`.

### Task 1.6: Build The Application Review UI

**Files:**

- Create: `../tea-center-frontend/src/features/applications/contracts.ts`
- Create: `../tea-center-frontend/src/features/applications/store.ts`
- Create: `../tea-center-frontend/src/features/applications/ApplicationQueue.vue`
- Create: `../tea-center-frontend/src/features/applications/ApplicationDetail.vue`
- Create: `../tea-center-frontend/src/features/applications/ApplicationDecisionDialog.vue`
- Create: `../tea-center-frontend/src/features/applications/store.test.ts`
- Create: `../tea-center-frontend/src/features/applications/ApplicationQueue.test.ts`
- Modify: `../tea-center-frontend/src/api.ts`
- Modify: `../tea-center-frontend/src/i18n.ts`

**Steps:**

1. Add typed API methods for list/detail/approve/reject/grant rotation.
2. Build a status-filtered queue and detail pane; keep selection state separate from server facts.
3. Require a rejection reason and confirmation for approval/rejection.
4. Show the one-time onboarding URL in a focused success dialog with copy and close actions; never retain it in the store after dismissal.
5. Cover success, typed conflict, authorization failure, empty queue, stale selection, and retry.
6. Verify keyboard navigation and text fit at 1280px and 390px.

### Task 1.7: Batch 1 End-To-End Checkpoint

**Files:**

- Create: `../tea-center-frontend/e2e/application-review.spec.ts`
- Modify: `../tea-center-frontend/playwright.config.ts`
- Modify: `../tea-center/deploy/local/compose.yaml`

**Steps:**

1. Submit one enterprise application through the public API using a fixture.
2. Sign in as the configured platform administrator.
3. Approve it, generate a grant, rotate the grant, and verify the old grant fails.
4. Reject a second application and verify immutable review history.
5. Capture desktop-width and mobile-width screenshots and inspect for clipping/overlap.
6. Run all Center and frontend checks.

**Batch 1 verification:**

```bash
cd ../tea-center && go test ./... -race && go vet ./...
cd ../tea-center-frontend && pnpm test:run && pnpm type-check && pnpm build && pnpm playwright test e2e/application-review.spec.ts
```

---

# Batch 2: Enterprise Application Form And Tenant OIDC Setup

## Batch 2 Exit Experience

1. An enterprise administrator opens `/apply`, submits company/domain/contact details, and sees a stable receipt without needing a Tea account.
2. After platform approval, the administrator opens `/onboarding#token=...`.
3. The portal displays the exact callback URL to copy into the enterprise IdP.
4. The administrator saves issuer/client configuration and performs a real test login.
5. The callback creates the first internal user and `tenant_admin` membership, consumes the onboarding grant, and opens the tenant setup completion screen.

### Task 2.1: Expose The Bounded Public Application API

**Files:**

- Modify: `../tea-center/internal/protocol/v1/enterprise_applications.go`
- Modify: `../tea-center/internal/httpapi/enterprise_applications.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/httpapi/enterprise_applications_test.go`
- Modify: `../tea-center/deploy/gateway/nginx.local.conf.template`
- Modify: `../tea-center/deploy/gateway/nginx.production.conf.template`

**Steps:**

1. Add `POST /v1/enterprise-applications` without browser authentication.
2. Bound body size, field length, duplicate JSON fields, request rate, and canonical domain format.
3. Return `202 Accepted` with an opaque application reference and generic status; do not disclose whether the domain already belongs to a tenant.
4. Add gateway rate limiting for this public route.
5. Test malformed, oversized, duplicate, rate-limited, and successful requests.

### Task 2.2: Build The Public Application Page

**Files:**

- Create: `../tea-center-frontend/src/features/onboarding/EnterpriseApplicationPage.vue`
- Create: `../tea-center-frontend/src/features/onboarding/applicationStore.ts`
- Create: `../tea-center-frontend/src/features/onboarding/EnterpriseApplicationPage.test.ts`
- Modify: `../tea-center-frontend/src/app/router.ts`
- Modify: `../tea-center-frontend/src/api.ts`
- Modify: `../tea-center-frontend/src/i18n.ts`

**Steps:**

1. Make `/apply` the actual application workflow, not a landing page.
2. Add company name, primary domain, administrator name/email, and optional note fields.
3. Provide inline validation, submission pending state, typed failure state, and a receipt state.
4. Do not add OIDC fields before approval.
5. Add component tests and a Playwright application-submission flow.

### Task 2.3: Persist All Authentication Transactions

**Files:**

- Create: `../tea-center/internal/postgres/migrations/00002_tenant_onboarding.sql`
- Create: `../tea-center/internal/auth/postgres_state_store.go`
- Create: `../tea-center/internal/auth/postgres_state_store_test.go`
- Refactor: `../tea-center/internal/session/browser.go`
- Create: `../tea-center/internal/session/postgres_browser_repository.go`
- Create: `../tea-center/internal/session/postgres_repository.go`
- Create: `../tea-center/internal/session/postgres_repository_test.go`
- Modify: `../tea-center/internal/session/service.go`
- Modify: `../tea-center/internal/app/app.go`

**Tables:**

- `oidc_transactions`
- `browser_sessions`
- `desktop_transactions`
- `handoffs`
- `endpoint_sessions`
- `used_refresh_credentials`

**Steps:**

1. Add repository ownership to `BrowserSessionService` instead of embedding a process-local map.
2. Add tenant id, OIDC connection id, and login purpose to OIDC/desktop transactions.
3. Preserve atomic consume semantics with one SQL statement or row lock.
4. Preserve refresh-reuse revocation across restarts and multiple API replicas.
5. Test restart recovery, expiry cleanup, replay, concurrent exchange, and refresh reuse.

### Task 2.4: Add Tenant OIDC Configuration And Secret Storage

**Files:**

- Create: `../tea-center/internal/secrets/store.go`
- Create: `../tea-center/internal/secrets/encrypted_postgres_store.go`
- Create: `../tea-center/internal/secrets/encrypted_postgres_store_test.go`
- Create: `../tea-center/internal/tenantconfig/oidc.go`
- Create: `../tea-center/internal/tenantconfig/store.go`
- Create: `../tea-center/internal/tenantconfig/service.go`
- Create: `../tea-center/internal/tenantconfig/service_test.go`
- Create: `../tea-center/internal/postgres/migrations/00003_tenant_oidc_configuration.sql`
- Modify: `../tea-center/cmd/center/main.go`
- Modify: `../tea-center/.env.example`
- Modify: `../tea-center/.env.production.example`

**Steps:**

1. Define `SecretStore.Put/Resolve/Remove` with tenant-scoped keys and no list operation returning values.
2. Encrypt secret payloads with AES-256-GCM using an active key id and key ring injected through deployment secrets.
3. Store only secret references in `oidc_connections`.
4. Validate exact HTTPS issuer/authorization/token/userinfo endpoints and reject credentials, fragments, localhost, link-local, private IP ranges, DNS rebinding, redirects to disallowed hosts, and overlong responses.
5. Return only `clientSecretConfigured: true|false` to every frontend DTO.
6. Test key rotation read compatibility and ciphertext tampering.

### Task 2.5: Replace Fixed OIDC With Transaction-Selected OIDC

**Files:**

- Refactor: `../tea-center/internal/auth/oidc.go`
- Refactor: `../tea-center/internal/auth/oidc_provider.go`
- Create: `../tea-center/internal/auth/tenant_login.go`
- Create: `../tea-center/internal/auth/tenant_login_test.go`
- Create: `../tea-center/internal/identity/directory.go`
- Create: `../tea-center/internal/identity/directory_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/httpapi/oidc_test.go`
- Modify: `../tea-center/internal/httpapi/desktop_oidc_test.go`

**Steps:**

1. Keep platform administrator login backed by the deployment-wide OIDC client.
2. Resolve tenant OIDC only from the server-owned onboarding or desktop transaction.
3. Store `loginPurpose = platform_admin | tenant_onboarding | desktop` in the OIDC transaction.
4. On onboarding callback, bind the verified `(connection, issuer, subject)` to a newly created internal user and `tenant_admin` membership in one transaction.
5. Consume the onboarding grant only after successful provider exchange and membership creation.
6. Fail closed on disabled tenant, disabled OIDC connection, domain mismatch, expired grant, issuer mismatch, or replay.

### Task 2.6: Build The OIDC Setup Wizard

**Files:**

- Create: `../tea-center-frontend/src/features/onboarding/OidcSetupPage.vue`
- Create: `../tea-center-frontend/src/features/onboarding/OidcCallbackDetails.vue`
- Create: `../tea-center-frontend/src/features/onboarding/OidcConfigurationForm.vue`
- Create: `../tea-center-frontend/src/features/onboarding/OidcTestResult.vue`
- Create: `../tea-center-frontend/src/features/onboarding/onboardingStore.ts`
- Create: `../tea-center-frontend/src/features/onboarding/onboardingStore.test.ts`
- Create: `../tea-center-frontend/src/features/onboarding/OidcSetupPage.test.ts`
- Modify: `../tea-center-frontend/src/app/router.ts`
- Modify: `../tea-center-frontend/src/api.ts`
- Modify: `../tea-center-frontend/src/i18n.ts`

**Wizard steps:**

```text
1. Confirm enterprise and domain
2. Copy Center callback URL
3. Create the enterprise IdP application outside Center
4. Enter issuer/client/endpoints/scopes
5. Save and run test login
6. Return as the first tenant administrator
```

**Steps:**

1. Read the onboarding token from the fragment, move it to memory, and clear the URL immediately.
2. Do not put the token in Pinia persistence, localStorage, analytics, errors, or API query strings.
3. Make the callback address read-only with a copy icon and tooltip.
4. Make the client secret write-only and clear it after the save request settles.
5. Redirect to the server-owned OIDC start URL; do not run OAuth logic in Vue.
6. Cover expired/rotated token, invalid OIDC configuration, provider cancellation, callback failure, and successful completion.

### Task 2.7: Batch 2 End-To-End Checkpoint

**Files:**

- Create: `../tea-center-frontend/e2e/tenant-onboarding.spec.ts`
- Create: `../tea-center/internal/httpapi/tenant_onboarding_test.go`

**Steps:**

1. Run a fake OIDC provider fixture with a stable issuer and subject.
2. Submit and approve an application.
3. Open the one-time link, configure OIDC, and complete test login.
4. Verify exactly one user and `tenant_admin` membership exist after callback retry.
5. Verify the onboarding token and provider code never appear in API/gateway logs or frontend state snapshots.
6. Restart Center during a pending state and verify the documented retry/recovery behavior.

---

# Batch 3: Manual Tenant IM And Model Provider Configuration

## Batch 3 Exit Experience

1. A platform administrator opens a tenant list and detail workspace.
2. The administrator saves or rotates the tenant IM `appKey`/`appSecret`; the secret disappears after submission and can never be read back.
3. The administrator creates, enables, disables, and edits model provider definitions and model lists.
4. Every accepted configuration change increments one tenant configuration revision and writes an audit event.
5. A preview shows exactly the safe configuration that a future endpoint may consume.

### Task 3.1: Add Versioned Tenant Configuration

**Files:**

- Create: `../tea-center/internal/tenantconfig/types.go`
- Extend: `../tea-center/internal/tenantconfig/store.go`
- Extend: `../tea-center/internal/tenantconfig/service.go`
- Extend: `../tea-center/internal/tenantconfig/service_test.go`
- Create: `../tea-center/internal/postgres/migrations/00004_tenant_configuration.sql`

**Tables:**

- `tenant_im_configurations`
- `tenant_model_providers`
- `tenant_model_definitions`
- `tenant_configuration_revisions`

**Rules:**

```text
IM
  one enabled configuration per tenant in V1
  provider = yunxin initially, but stored as a provider-neutral id
  appKey is non-secret
  appSecretRef is server-only
  provisioningStatus = not_implemented

Model provider
  stable providerId
  kind, displayName, baseUrl, enabled
  credentialRef is server-only
  bounded ordered model definitions
  no Agent runtime allowlist; every runtime may consume a compatible provider
```

**Steps:**

1. Write service tests for create/update/disable, secret preservation when omitted, explicit secret rotation, duplicate ids, and revision increments.
2. Update configuration plus audit event in one database transaction.
3. Never increment the revision for a rejected request or byte-equivalent no-op.
4. Keep IM app secret and model credential values out of DTOs and audit payloads.

### Task 3.2: Add Tenant Administration APIs

**Files:**

- Extend: `../tea-center/internal/tenantconfig/types.go`
- Extend: `../tea-center/internal/tenantconfig/store.go`
- Extend: `../tea-center/internal/tenantconfig/service.go`
- Create: `../tea-center/internal/protocol/v1/tenant_configuration.go`
- Create: `../tea-center/internal/httpapi/tenant_configuration.go`
- Create: `../tea-center/internal/httpapi/tenant_configuration_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/app/app.go`
- Create: `../tea-center/docs/protocol/tenant-configuration-v1.md`

**Steps:**

1. Add tenant list/detail routes for platform administrators.
2. Add write-only IM secret and model credential mutation DTOs.
3. Reject any tenant id supplied in request bodies; derive scope from the path after platform-admin authorization.
4. Return `configured`, `updatedAt`, and safe metadata only.
5. Test cross-tenant isolation, redaction, secret rotation, optimistic conflict, and audit creation.

### Task 3.3: Define Endpoint Bootstrap V1

**Files:**

- Create: `../tea-center/docs/protocol/endpoint-bootstrap-v1.md`
- Create: `../tea-center/internal/protocol/v1/endpoint_bootstrap.go`
- Create: `../tea-center/internal/httpapi/endpoint_bootstrap.go`
- Create: `../tea-center/internal/httpapi/endpoint_bootstrap_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `docs/adr/0014-center-endpoint-bootstrap.md`

**Safe response shape:**

```json
{
  "schemaVersion": 1,
  "revision": 7,
  "generatedAt": "2026-08-24T12:00:00Z",
  "tenant": { "id": "tenant-1", "domain": "example.com", "displayName": "Example" },
  "user": { "id": "user-1", "displayName": "Ada" },
  "im": { "provider": "yunxin", "appKey": "public-app-key", "accountStatus": "notProvisioned" },
  "modelProviders": [
    {
      "id": "managed-openai",
      "kind": "openai-compatible",
      "displayName": "Managed OpenAI",
      "enabled": true,
      "models": ["gpt-example"]
    }
  ]
}
```

**Steps:**

1. Authenticate with the endpoint access session and derive tenant/user from it.
2. Never accept a tenant id from the endpoint request.
3. Never include OIDC secrets, IM app secret, model credential, provider tokens, or internal secret references.
4. Add ETag/revision behavior so Desktop can avoid replacing an unchanged cache.
5. Test tenant isolation and complete JSON redaction.

### Task 3.4: Build Tenant And Configuration UI

**Files:**

- Create: `../tea-center-frontend/src/features/tenants/contracts.ts`
- Create: `../tea-center-frontend/src/features/tenants/store.ts`
- Create: `../tea-center-frontend/src/features/tenants/TenantListPage.vue`
- Create: `../tea-center-frontend/src/features/tenants/TenantDetailPage.vue`
- Create: `../tea-center-frontend/src/features/tenants/ImConfigurationPanel.vue`
- Create: `../tea-center-frontend/src/features/tenants/ModelProviderList.vue`
- Create: `../tea-center-frontend/src/features/tenants/ModelProviderEditor.vue`
- Create: `../tea-center-frontend/src/features/tenants/ConfigurationPreview.vue`
- Create: `../tea-center-frontend/src/features/tenants/store.test.ts`
- Create: `../tea-center-frontend/src/features/tenants/TenantDetailPage.test.ts`
- Modify: `../tea-center-frontend/src/api.ts`
- Modify: `../tea-center-frontend/src/i18n.ts`

**Steps:**

1. Build a tenant list/detail workspace with tabs for Overview, Identity, IM, Models, and Audit.
2. Use secret inputs only for replacement values; never prefill them.
3. Show `Configured`/`Not configured`, revision, and last update metadata.
4. Use structured rows for model definitions, stable add/remove controls, and explicit enable toggles.
5. Show a safe endpoint-bootstrap preview from a server projection, not a frontend reconstruction.
6. Test partial saves, conflict refresh, secret clearing, empty states, and keyboard flow.

### Task 3.5: Batch 3 End-To-End Checkpoint

**Files:**

- Create: `../tea-center-frontend/e2e/tenant-configuration.spec.ts`

**Steps:**

1. Configure IM app metadata and rotate its secret.
2. Configure two model providers, disable one, and edit its models.
3. Confirm old secrets cannot be retrieved through list/detail/bootstrap APIs.
4. Confirm every real change advances the same tenant revision and produces an audit row.
5. Render desktop and mobile screenshots of list, detail, secret update, error, and empty states.

---

# Batch 4: Tea Desktop Unified Enterprise Login

## Batch 4 Exit Experience

1. Tea Desktop opens on one focused enterprise-domain login screen when no Center profile exists.
2. An unknown, malformed, inactive, or unconfigured domain fails before a browser is opened.
3. A known domain opens the correct tenant OIDC in the system browser.
4. The callback activates the existing Desktop window, exchanges the one-time code with device proof, and loads the tenant bootstrap.
5. Restarting Desktop silently refreshes a valid session from Keychain. If Center is unavailable, Desktop may enter an explicitly labeled cached/offline state using safe cached configuration.

### Task 4.1: Add Safe Enterprise Discovery

**Files:**

- Create: `../tea-center/internal/protocol/v1/enterprise_directory.go`
- Create: `../tea-center/internal/httpapi/enterprise_directory.go`
- Create: `../tea-center/internal/httpapi/enterprise_directory_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/deploy/gateway/nginx.local.conf.template`
- Modify: `../tea-center/deploy/gateway/nginx.production.conf.template`

**Response:**

```json
{
  "organizationDomain": "example.com",
  "displayName": "Example",
  "loginAvailable": true
}
```

**Steps:**

1. Normalize the domain server-side and return only minimal discovery metadata.
2. Return one generic `organization_not_found` response for unknown, inactive, or OIDC-unconfigured tenants.
3. Add rate limiting and bounded negative caching at the gateway/API boundary.
4. Do not return issuer, client id, authorization URL, tenant id, or internal configuration.

### Task 4.2: Extend Desktop Login Transactions With Enterprise Domain

**Files:**

- Modify: `../tea-center/internal/protocol/v1/desktop_auth.go`
- Modify: `../tea-center/internal/protocol/v1/desktop_auth_test.go`
- Modify: `../tea-center/internal/session/repository.go`
- Modify: `../tea-center/internal/session/service.go`
- Modify: `../tea-center/internal/session/service_test.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/httpapi/desktop_oidc_test.go`
- Modify: `../tea-center/docs/protocol/desktop-auth.md`

**Steps:**

1. Add canonical `organizationDomain` to `DesktopLoginRequest` and persist the resolved tenant/OIDC connection in the server transaction.
2. Reject unknown, inactive, suspended, or unconfigured tenants before issuing a browser ticket.
3. Select OIDC only from the stored transaction during browser redirect and callback.
4. Preserve device proof, verifier, single-use handoff, refresh rotation, and generic error behavior.
5. Change the pre-release app scheme consistently from `tea-workshop` to `tea-desktop` if product naming is confirmed before implementation.

### Task 4.3: Add Tauri Deep Link, Browser Open, HTTP, And Device Identity

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/center_auth/mod.rs`
- Create: `src-tauri/src/center_auth/model.rs`
- Create: `src-tauri/src/center_auth/device_identity.rs`
- Create: `src-tauri/src/center_auth/client.rs`
- Create: `src-tauri/src/center_auth/error.rs`
- Create: `src-tauri/src/center_auth/device_identity_test.rs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Dependencies:**

- Rust: `reqwest`, `ed25519-dalek`, `url`, `axum`, and `tauri-plugin-opener`.
- TypeScript: no callback package; the WebView receives only typed auth-state events.

**Steps:**

1. Bind a literal IPv4 loopback listener on an ephemeral port before creating the desktop transaction.
2. Generate one Ed25519 device keypair in the Rust host; store the private material in Keychain/Credential Manager and expose only the public key reference.
3. Implement strict Center base-origin validation, HTTPS-only outside loopback debug, request/response size limits, timeouts, and typed error mapping.
4. Keep HTTP, cryptographic proof, and token parsing out of Vue.
5. Test device key reuse, corrupt key recovery, wrong loopback nonce/path, duplicate callbacks, timeout, and oversized responses.

### Task 4.4: Implement Host-Owned Center Session And Cache

**Files:**

- Create: `src-tauri/src/center_auth/session.rs`
- Create: `src-tauri/src/center_auth/credential_store.rs`
- Create: `src-tauri/src/center_auth/cache.rs`
- Create: `src-tauri/src/center_auth/service.rs`
- Create: `src-tauri/src/center_auth/commands.rs`
- Create: `src-tauri/src/center_auth/session_test.rs`
- Create: `src-tauri/src/center_auth/cache_test.rs`
- Modify: `src-tauri/src/lib.rs`

**Commands:**

```text
resolve_center_enterprise(domain)
start_center_login(domain)
get_center_auth_state()
refresh_center_bootstrap()
logout_center()
```

**Credential rules:**

```text
OS credential facility
  Center refresh credential
  device private key

Memory only
  access token
  handoff verifier
  pending transaction id/code

SQLite safe cache
  Center origin
  enterprise domain/name
  tenant/user safe identity
  endpoint id
  bootstrap revision and safe projection
  generatedAt/lastValidatedAt
```

**Steps:**

1. Write state-machine tests for signed out, resolving, browser pending, exchanging, authenticated, refresh required, recovery required, and offline cached.
2. Start the transaction in Rust, open the returned browser URL only after matching the transaction id.
3. Handle the loopback callback once, sign the exact protocol payload, exchange, and immediately discard the one-time values.
4. Store the refresh credential before reporting login success; on storage failure revoke the server session and fail closed.
5. Fetch and atomically replace the bootstrap cache only after schema/revision validation.
6. On logout, revoke the Center session when online, clear refresh/cache/device association as specified, disconnect IM, and clear user projections.

### Task 4.5: Build The Desktop Authentication Feature

**Files:**

- Create: `src/features/auth/contracts.ts`
- Create: `src/features/auth/store.ts`
- Create: `src/features/auth/store.test.ts`
- Create: `src/features/auth/components/EnterpriseLogin.vue`
- Create: `src/features/auth/components/LoginProgress.vue`
- Create: `src/features/auth/components/OfflineProfileNotice.vue`
- Create: `src/features/auth/components/EnterpriseLogin.test.ts`
- Create: `src/infrastructure/auth/tauriCenterAuthClient.ts`
- Modify: `src/App.vue`
- Modify: `src/main.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/locales/locales.test.ts`

**UI states:**

```text
Signed out
  enterprise domain input
  continue command

Resolving
  fixed layout progress state

Unknown enterprise
  localized generic failure
  domain remains editable

Browser pending
  waiting state, retry/cancel

Authenticated
  enter normal workspace

Offline cached
  explicit stale timestamp
  Center-dependent actions disabled

Recovery required
  clear explanation and sign-in-again command
```

**Steps:**

1. Make the actual login workflow the first screen; do not add a marketing landing page.
2. Keep components presentational; the Pinia store owns discovery/login/bootstrap orchestration through a typed client.
3. Validate and normalize the domain in the host as authoritative; frontend validation is only ergonomic.
4. Add distinct localized errors for invalid domain, organization unavailable, browser cancellation, callback expiry, Center unavailable, storage failure, and recovery required.
5. Preserve stable layout dimensions across all dynamic states.
6. Verify with component tests and Playwright/Tauri screenshots at desktop minimum size and narrow width.

### Task 4.6: Integrate Bootstrap Without Duplicating Runtime Facts

**Files:**

- Create: `src/features/managed-config/contracts.ts`
- Create: `src/features/managed-config/store.ts`
- Create: `src/features/managed-config/store.test.ts`
- Create: `src/infrastructure/managed-config/tauriManagedConfigClient.ts`
- Modify: `src/App.vue`
- Modify: `src/infrastructure/channels/channelComposition.ts`
- Modify: `src/features/settings/contracts.ts`
- Modify: `src-tauri/src/settings/model.rs`
- Modify: `src-tauri/src/settings/repository.rs`

**Steps:**

1. Project Center bootstrap into a separate managed-config store; do not merge it into application preferences.
2. Display tenant/model catalog metadata from the cached server revision.
3. Keep existing runtime descriptors authoritative for runtime availability; managed models are policy/catalog inputs, not fake ready runtimes.
4. Return IM `appKey` plus `accountStatus = notProvisioned`; do not send `appSecret` or attempt Yunxin login without a per-user account/token.
5. Replace the build-time `VITE_YUNXIN_APP_KEY` only after an actual managed IM account is available; until then preserve the existing local/manual IM path behind an explicit source label.
6. Record precedence as `managed active account > explicit local account`; never silently overwrite or delete the local credentials.

### Task 4.7: Define Offline And Recovery Semantics

**Files:**

- Create: `docs/testing/center-auth-and-offline.md`
- Modify: `docs/adr/0014-center-endpoint-bootstrap.md`
- Modify: `../tea-center/docs/protocol/endpoint-bootstrap-v1.md`

**Acceptance matrix:**

- First launch while Center is unavailable: login unavailable; no false authenticated state.
- Prior login, access expired, refresh valid, Center online: silent refresh and bootstrap validation.
- Prior login, Center unavailable, safe cache present: explicit offline-cached mode.
- Refresh revoked/reused: delete local refresh credential and require login.
- Tenant suspended: endpoint refresh/bootstrap fails closed; cached mode cannot claim active membership.
- Bootstrap schema unsupported: preserve old cache for diagnostics, block managed configuration use, request upgrade.
- Future IM token still valid while Center is unavailable: reconnect may be allowed by the future IM credential policy.
- No network and cached messages: offline reading is deferred until a local message repository exists.

### Task 4.8: Batch 4 End-To-End Checkpoint

**Files:**

- Create: `src/features/auth/enterpriseLoginFlow.test.ts`
- Extend: `../tea-center-frontend/e2e/tenant-onboarding.spec.ts`
- Extend: `../tea-center/internal/httpapi/desktop_oidc_test.go`

**Steps:**

1. Start Center, PostgreSQL, gateway, frontend, and a fake tenant OIDC provider.
2. Verify unknown domain failure without opening a browser.
3. Complete known-domain OIDC and loopback exchange.
4. Verify refresh credential exists only in OS credential storage and access token is absent after process exit.
5. Restart Desktop and verify silent refresh.
6. Stop Center and verify explicit offline-cached state.
7. Revoke the endpoint session and verify recovery-required behavior.
8. Inspect logs, SQLite, settings files, Vue state, and screenshots for token/secret leakage.

**Batch 4 verification:**

```bash
cd ../tea-center && go test ./... -race && go vet ./...
cd ../tea-center-frontend && pnpm test:run && pnpm type-check && pnpm build && pnpm playwright test
cd ../tea-desktop && pnpm test:run && pnpm type-check && pnpm build
cd ../tea-desktop && cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml
```

---

# Deferred Batch 5: IM Account Provisioning And Offline Messages

This is deliberately outside the four requested batches, but Batch 3 and Batch 4 must leave these boundaries ready:

1. Add an `IMProvisioner` port in Center and a Yunxin server API adapter.
2. Allocate one account transactionally with unique constraints on `(tenant_id, user_id, im_application_id)` and `(im_application_id, im_account)`.
3. Issue or refresh short-lived IM tokens; never return the tenant app secret.
4. Deliver `appKey/account/token` only to the Desktop Rust host and store the token in OS credential storage.
5. Connect `YunxinWebChannelTransport` from the managed credential source.
6. Add a separate encrypted/bounded local message repository if offline history is required. Define retention, logout deletion, tenant suspension, and attachment behavior before implementation.

## Global Security And Reliability Gates

- All public inputs have size, depth, count, timeout, and rate bounds.
- Tenant scope is derived from authenticated server state, never trusted request bodies or headers.
- All secrets are redacted from JSON DTOs, errors, audit payloads, traces, logs, fixtures, screenshots, and browser state.
- Approval, first-admin binding, onboarding grant consumption, refresh rotation, and future IM allocation are concurrency-tested.
- Database backups include RPO/RTO targets before public launch; encrypted secret keys are backed up separately.
- Startup fails closed on missing database, secret key ring, platform OIDC configuration, or unsupported schema.
- Health checks separate liveness from readiness and include database readiness without exposing configuration details.
- The public deployment targets at least 99.9% availability, p95 API latency below 300 ms for non-provider requests, and a documented maintenance window for migrations.

## Commit Checkpoints

Do not commit without explicit user instruction. When authorized, keep commits scoped and signed off, for example:

```text
feat(center): persist enterprise applications
feat(center): add tenant oidc onboarding
feat(center-ui): add application review workspace
feat(center-ui): add tenant configuration workspace
feat(desktop): add device-bound center login
test(auth): cover tenant login recovery
```

## Recommended Execution Order

Execute one batch at a time. Stop after every batch, run its full verification commands, start the relevant local services, and hand the user a URL/application build plus the exact acceptance flow. Do not begin the next batch until the user has tried the current experience and accepted its contracts.

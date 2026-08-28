# ADR 0014: Center-Owned Endpoint Bootstrap And Local Recovery

- Status: Accepted
- Date: 2026-08-24

## Implementation Status

Implemented on 2026-08-25:

- Center exposes bounded enterprise discovery and binds the resolved tenant and
  OIDC connection to each Desktop transaction.
- Center browser redirect/callback selects the provider only from that stored
  transaction and resolves an existing active tenant member by exact issuer and
  subject.
- Desktop Rust owns Center HTTP, Ed25519 proof, loopback callback, browser opening,
  Keychain refresh/device material, access-token memory, and the safe SQLite
  cache.
- The host publishes a monotonic authentication generation. Cancellation,
  logout, replacement login, refresh, and callback completion compare that
  generation before changing credentials, cache, or public state.
- Vue renders only the typed public auth/bootstrap projection and keeps managed
  configuration separate from user settings and runtime availability.
- A workspace lifecycle creates fresh tenant transports after authentication
  and clears all channel, collaboration, conversation, and managed projections
  immediately on logout or tenant replacement.

For local development, runtime `TEA_CENTER_ORIGIN` selects the Center API origin
and may use HTTP only for a loopback Center origin. Packaged builds may embed
the same public origin at compile time because Finder and other GUI launchers do
not inherit a developer shell environment; an explicit runtime value still
wins. Release builds require an HTTPS Center origin. SaaS and private builds
use the same client logic and differ only by this non-secret origin. The browser
handoff uses the bounded loopback callback specified by ADR 0015.

Packaged builds may also embed `TEA_CENTER_ENTERPRISE_DOMAIN`. The host validates
and normalizes this non-secret domain during startup, then returns it only as a
default input value in the initialization DTO. Runtime environment values take
precedence over compile-time values for both variables. The Vue login form keeps
the default domain editable and never launches the browser until the user
explicitly submits the form. Center remains authoritative for enterprise
availability and display name.

## Context

Tea Desktop needs a unified enterprise login that obtains safe tenant identity,
future per-user IM login material, and managed model-provider metadata from Tea
Center. Public SaaS must isolate multiple enterprises, while private enterprise
deployments must use the same client behavior against another Center origin.

The Vue WebView must not own OIDC exchange, device proof, refresh credentials,
secret persistence, or tenant authorization. Existing Desktop settings and
conversation state are not authoritative stores for managed identity. Caching
all Center responses in localStorage or SQLite would expose credentials and
make stale data look like an active membership.

Offline IM message reading is a separate capability. Caching IM login material
does not create a durable, bounded, encrypted message repository.

## Decision

### Center Is The Authoritative Source

Center owns tenants, verified domains, OIDC identities and memberships,
endpoint sessions, IM application configuration, model-provider catalog, and a
monotonic tenant configuration revision. Desktop never chooses a tenant id; it
submits an enterprise domain and Center binds the resolved tenant/OIDC
connection into a server-owned login transaction.

Center returns one versioned endpoint bootstrap projection derived from the
authenticated endpoint session. V1 may include safe tenant/user identity, IM
provider plus public app key and provisioning status, enabled model-provider
metadata, model identifiers, revision, and generation time. It never includes
OIDC secrets, an IM app secret, model credentials, provider bearer tokens, or
internal secret references.

V1 is served by `GET /v1/endpoint/bootstrap` and accepts no tenant selector,
query parameters, or request body. Center resolves the tenant and user only from
the endpoint access session and fails closed when the tenant is no longer
active. Until per-user IM provisioning exists, an enabled complete IM
configuration reports only the public app key and `accountStatus:
notProvisioned`; no IM account, password, or token is returned.

The shared tenant configuration revision is returned in the body. Responses use
`Cache-Control: private, no-cache`, `Vary: Authorization`, and a weak ETag that
covers the safe projection while excluding the per-delivery `generatedAt`
timestamp. A matching `If-None-Match` returns `304` so Desktop can retain an
unchanged validated cache without making authenticated data publicly cacheable.

### Rust Host Owns Authentication

The Tauri Rust host owns Center origin validation, system-browser opening,
loopback callback handling, Ed25519 device identity, one-time code exchange, refresh
rotation, logout/revocation, bootstrap schema validation, and cache replacement.
Vue emits intent through a typed client and renders a store projection only.

Access tokens, handoff codes/verifiers, and pending transactions are memory
only. The device private key and rotating Center refresh credential use the OS
credential facility. They never enter Vue, localStorage, settings JSON,
conversation records, logs, or SQLite.

The public `CenterAuthState.generation` is a non-secret ordering fence. Vue
rejects states from earlier generations and separately invalidates stale local
Promises. This prevents a cancelled callback, refresh, or initialization from
reopening a workspace after logout.

### SQLite Stores Only A Safe Projection

Desktop SQLite may cache Center origin, enterprise domain/display name, safe
tenant and user identity, endpoint id, bootstrap schema/revision, safe IM/model
metadata, and validation timestamps. Cache replacement is atomic and occurs
only after schema and revision validation.

Managed configuration stays separate from user preferences and runtime facts.
Runtime descriptors remain authoritative for runtime availability. A managed
model catalog does not create a ready runtime. Until Center provisions a
per-user IM account/token, the existing explicit local IM configuration remains
separate and visibly sourced.

### Offline And Recovery States Are Explicit

If Center is unavailable after a prior successful login, Desktop may show an
`offline cached` state using the last safe projection. It does not claim current
membership, does not refresh managed facts, and disables Center-dependent
mutations. It permits only capabilities whose required local data already
exists. It does not promise cached IM credentials or offline messages. A
revoked/reused refresh credential, suspended tenant, unsupported bootstrap
schema, corrupt credential, or failed secure write clears the refresh
credential and cached bootstrap, transitions to `recovery required`, and fails
closed.

Logout revokes the current access session on a best-effort basis, but local
logout never depends on Center availability. It always invalidates in-flight
authentication, clears Keychain refresh material and the safe cache, and
destroys the current tenant workspace before another one is created.

Offline message history is deferred until a dedicated repository defines
encryption, size/retention bounds, attachment handling, logout deletion, tenant
suspension, and recovery semantics.

## Alternatives Considered

### Perform OIDC And Token Exchange In Vue

Rejected because WebView state and browser storage would become a credential
boundary and would expose authentication logic to XSS and frontend diagnostics.

### Cache The Entire Bootstrap Response

Rejected because future responses may contain endpoint-delivered credentials.
The host must parse a typed allowlisted projection and persist only known-safe
fields.

### Put Managed Configuration In Desktop Settings

Rejected because user preference and tenant policy have different ownership,
revision, logout, suspension, and recovery rules.

### Treat Cached IM Credentials As Offline Messages

Rejected because authentication material cannot reconstruct message bodies or
define local retention and deletion.

## Consequences

### Positive

- Tenant scope, Center authentication credentials, and model Provider secrets
  stay outside the WebView. ADR 0016 defines the narrower WIP exception for an
  active IM credential used by the Web SDK transport.
- SaaS and private deployments differ by validated Center origin, not client
  authentication implementations.
- Safe cached metadata can support an honest degraded offline state.
- Future IM provisioning and model policy can extend one revisioned bootstrap
  without changing conversation persistence.

### Negative

- The Rust host needs HTTP, a short-lived loopback listener, device-key, credential-store, session,
  and SQLite-cache modules with explicit state-machine tests.
- OS credential behavior and loopback-listener policy require platform-specific
  integration verification.
- Offline use remains intentionally limited until separate data repositories
  are designed.

## Migration

This is a pre-release contract. Add the managed authentication store and safe
cache as new host-owned persistence. Do not copy existing IM tokens, provider
keys, or Vite environment values into the Center cache. Existing explicit local
IM configuration remains available under an explicit source until a managed
per-user account exists.

## Rollback

Disable the Center login composition and managed-configuration projection while
leaving user preferences and existing local conversations intact. Clear the
Center refresh credential and safe cache when the user logs out. Do not fall
back to WebView OIDC, plaintext files, or unscoped tenant selection.

## Failure And Recovery

- First launch with Center unavailable remains signed out.
- Secure-storage failure after exchange revokes the server session when
  reachable and does not report login success.
- Unsupported or malformed bootstrap data clears refresh material and the
  prior cache, then requires a new login.
- Refresh reuse or revocation clears the local refresh credential and requires
  login.
- Center unavailability with a valid prior safe cache enters an explicitly
  timestamped offline state.
- Remote revocation is best effort. Local cache, credential, and workspace
  deletion are authoritative and idempotent even when Center is unavailable.

## References

- Tea Center `docs/adr/0001-multi-tenant-control-plane.md`
- Tea Center `docs/protocol/enterprise-onboarding-v1.md`
- Tea Center `docs/protocol/desktop-auth.md`
- `docs/plans/2026-08-24-multi-tenant-onboarding-and-desktop-login.md`

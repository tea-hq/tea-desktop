# Center-Managed Runtime P1 Implementation Plan

**Goal:** After one successful enterprise OIDC login, Tea Desktop obtains its
tenant-scoped IM account and model Provider configuration from Center, logs in
to IM automatically, and configures new built-in Agent conversations without
exposing model Provider secrets to Vue/WebView. The WIP IM transport receives
only its active app key/account/token in WebView memory for SDK login.

## Implementation Status

Implemented and verified on 2026-08-25. Tasks 1 through 8 are complete in the
three local repositories. Verification included a fresh Compose PostgreSQL
database, authenticated calls to the deployed runtime-configuration endpoint,
real PostgreSQL integration tests, a packaged macOS debug build, Web SDK
transport tests, retained sidecar protocol tests, and desktop/narrow browser
inspection with no console errors. The active IM transport was changed from
the packaged sidecar to the WebView SDK after the initial verification.

The WIP database reset intentionally removed the previously configured real
enterprise OIDC connection. A tenant administrator must enter that deployment
owned configuration again before repeating the operator-driven browser login.
The Center-to-Desktop contract was verified independently with a short-lived
test endpoint session scoped to a dedicated validation tenant; no test
credential is a deployment credential.

## Completion Invariants

1. Center allocates at most one active IM account for
   `(tenant_id, user_id, provider_id)`, including under concurrent requests and
   multiple Center replicas.
2. `/v1/endpoint/bootstrap` remains a cacheable, secret-free projection.
   `/v1/endpoint/runtime-configuration` is authenticated, tenant/user scoped,
   and always returned with `Cache-Control: no-store`.
3. Model Provider API keys remain in Center and Desktop Rust/OS credentials.
   IM app key/account/token may enter only the dedicated Web transport's
   temporary memory and vendor SDK. No managed secret enters Pinia,
   localStorage, logs, audit payloads, or conversation snapshots.
4. Vue has no manual IM account/token input. Infrastructure composition owns
   the direct Yunxin Web SDK transport; components and stores remain
   provider-neutral.
5. Managed Provider availability is global to the built-in Tea runtime. Agent
   roles do not restrict which configured Provider can be selected.
6. Signing out disposes the Web SDK and channel projections, clears managed
   runtime credentials, then revokes/clears the Center session.
7. The repositories remain WIP: initial schemas and contracts are replaced
   directly; no compatibility or migration bridge is added.

## Task 1: Record Cross-Layer Contracts

**Output:** Desktop ADR 0016 plus Center runtime-configuration protocol and
control-plane ADR.

**Test:** Documentation names, routes, state values, and verification commands
match the implementation.

## Task 2: Center Runtime Credential Contract

**Files:** Center initial schema, `tenantconfig` runtime types/service/store,
`protocol/v1`, HTTP router/handler, application composition.

**Output:** An endpoint-session-authenticated runtime configuration response
with independent `im` and `modelProviders` resources. Provider secrets are
resolved only while producing this response.

**Tests:** Scope cannot be supplied by query/body; suspended tenants and
disabled resources fail closed; JSON allowlist and `no-store` headers are
asserted; secret values are absent from bootstrap and logs.

## Task 3: Idempotent IM Provisioning

**Files:** Center initial schema, new `runtimeconfig` application package and
Yunxin HTTP adapter, executable composition.

**Output:** A lease-backed claim/complete state machine stores a stable account
and encrypted token reference. Yunxin `user/create.action` and
`user/update.action` are accessed through a bounded HTTP client with signed
headers and typed provider errors.

**Tests:** Concurrent callers create one account; completed allocation is
reused; expired claims recover; provider timeout/rejection is safe to retry;
fake Yunxin server verifies request signing and response bounds.

## Task 4: Desktop Managed Workspace Service

**Files:** `src-tauri/src/center_auth`, new `managed_runtime` module, credential
provider, Tauri commands, `src/infrastructure/auth`.

**Output:** Rust refreshes the endpoint access token, fetches runtime
configuration, stores secrets under tenant/user-scoped Keychain keys, returns
a safe runtime status/catalog DTO, and exposes active IM credentials only from
a dedicated pull command used by the Web transport.

**Tests:** Resource-level failures, refresh retry, tenant/user scope changes,
redaction, Keychain cleanup, and sign-out ordering.

## Task 5: IM Transport Implementations And Active Web SDK

**Files:** `src/infrastructure/channels`, `src-channel-sidecar`, sidecar build
script, and Rust `channels` module.

**Output:** `YunxinWebChannelTransport` is the active implementation and pulls
the current credential through Tauri immediately before login. The isolated
sidecar and its versioned JSON Lines protocol remain tested source but are not
started, built by the default build, or packaged as `externalBin`.

**Tests:** Web SDK contract/mapping, credential rotation, redaction, disposal
races, Deno protocol checks, and Rust fake-process integration tests.

## Task 6: Managed Model Provider Runtime Generation

**Files:** Desktop conversation Tea driver/registry/commands and model catalog
contracts; `tea-rs` only if its existing public facade is insufficient.

**Output:** Center `openai_compatible` Providers resolve through the `tea-rs`
facade. Reconfiguration publishes a new runtime generation: existing
conversations retain their runtime `Arc`, while new conversations use the
latest generation.

**Tests:** Multiple Providers/models, invalid configuration, generation swap,
old conversation continuity, and no Agent-role allowlist.

## Task 7: Replace Manual UI And Add Operations Visibility

**Files:** Desktop channel composition/store/components/locales and Center
frontend tenant detail/API/i18n.

**Output:** Desktop automatically connects after managed workspace activation
and renders distinct preparing/ready/error states. The Center admin tenant view
shows provisioning status, assigned count, last safe error code, and credential
rotation guidance without displaying secrets.

**Tests:** Store/component interactions and locale parity; browser screenshots
at desktop and narrow viewports; no console errors or layout overlap.

## Task 8: End-To-End Verification

**Commands:**

```sh
# tea-center
go test ./...
go test -race ./...
go vet ./...

# tea-center-frontend
pnpm type-check
pnpm build

# tea-desktop
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
```

**Manual flow:** Reset the WIP database, configure one tenant's OIDC/IM/model
Provider values, complete Desktop OIDC, observe automatic IM connection and
dynamic models, start an Agent conversation, sign out, and verify the sidecar
is not running, the Web SDK is disposed, and managed Keychain values are gone.

The database reset, IM/model configuration, endpoint runtime response, resource
degradation, secret redaction, and Desktop package steps were completed during
implementation. Repeating the real browser portion requires a tenant
administrator to restore the deployment's OIDC client id and write-only
secret after the intentional reset.

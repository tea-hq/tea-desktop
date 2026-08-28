# ADR 0016: Center-Managed Runtime Credentials

- Status: Accepted and implemented
- Date: 2026-08-25
- Updated: 2026-08-27

## Context

Center delivers a tenant/user-scoped IM account and model Provider
configuration after enterprise OIDC login. Provider API keys configure the
built-in Tea runtime and must remain outside the renderer. The current product
uses Yunxin's supported JavaScript SDK; a future release may replace it with a
native SDK owned by Rust.

An isolated Deno sidecar was implemented and verified during P1. The project is
still WIP, and the current product decision is to run the vendor Web SDK in the
WebView while retaining the sidecar source as an inactive candidate.

## Decision

Center exposes endpoint-session-authenticated
`GET /v1/endpoint/runtime-configuration`. Tenant and user scope come only from
the endpoint session. The response uses `Cache-Control: no-store`; bootstrap
remains secret-free and cacheable.

Rust fetches and validates the complete response, stores it under a
tenant/user-scoped OS credential entry, and dynamically registers model
Provider configurations in the existing built-in Tea runtime. Provider API
keys never cross Tauri IPC.

Desktop initializes Tea independently from the process configuration directory
(`TEA_CONFIG_DIR` or `~/.tea`) before authentication. Authentication adds ready
Center providers to the long-lived Tea runtime; it does not replace the local
catalog, sessions, tools, event bridge, or workspace resources. Desktop assigns
final `local.<original-id>` and `center.<original-id>` identities before each
provider is constructed. Providers with the same original ID therefore coexist
and use one identity consistently across catalogs, streams, continuations, and
credentials.

The Tea runtime publishes immutable provider-registry generations. Registration
and removal are atomic, duplicate registration fails, and each active run keeps
the generation it resolved at start. Sessions persist only an explicitly
selected model reference. Registering providers never changes that selection;
only a user model-selection command does so. A removed provider becomes
unavailable to future runs without invalidating history or an already active
run.

For IM only, Rust retains the active validated `appKey/account/token` in memory
and exposes it through `get_managed_im_credentials`. The command succeeds only
while an authenticated managed workspace has a ready IM resource. The
`YunxinWebChannelTransport` pulls the value immediately before SDK login. The
credential is not part of `ManagedWorkspaceState`, Pinia, events, conversation
snapshots, settings, SQLite, localStorage, or logs. The transport retains only
an in-memory credential digest to detect rotation and destroys SDK state before
Center logout.

`src-channel-sidecar` and the Rust sidecar host remain in the repository with
their tests and explicit `sidecar:*` scripts. They are not selected by channel
composition, started by managed-runtime, declared as `externalBin`, or built by
the normal Desktop build.

Existing and new conversations share the same long-lived Tea runtime. Each run
resolves the session's selected model against the latest registry generation,
then keeps that generation until the run ends. Agent roles do not restrict the
managed Provider catalog.

Tea remains registered even when no provider can be initialized. Runtime
selection is renderer-local and performs no IPC. Conversation creation is
deferred until the first prompt, where a typed not-configured or unavailable
failure is projected without blocking the rest of Desktop.

## Alternatives

- Active sidecar: implemented and retained, but deferred to reduce current
  packaging and process-lifecycle complexity.
- Native Yunxin SDK in Rust: preferred future direction once a supported,
  testable SDK and platform packaging plan are selected.
- Proxy IM through Center: rejected because Center is a control plane, not an
  IM data plane.

## Consequences

The current build is smaller and uses the vendor's supported Web runtime.
Renderer compromise can read the active IM token; this is an explicitly
accepted WIP tradeoff. Provider API keys, OIDC credentials, endpoint session
credentials, and device keys remain Host-only.

Source-qualified IDs are internal runtime identities, not renames of the
administrator-owned provider IDs. A future UI catalog can group by the retained
source and display the original ID without choosing one source as an override
winner.

The CSP permits only the confirmed Yunxin LBS HTTPS endpoint and secure link
WebSocket in addition to Tauri IPC. The Web transport validates credential
shape again, bounds all mapped provider data, removes listeners symmetrically,
redacts SDK failures, and fences late asynchronous results after disposal.

## Recovery And Logout

Refreshing managed configuration reloads the credential through IPC. An
unchanged digest keeps the existing login; a rotated credential causes a clean
logout/login. Authentication, kicked-offline, account change, and disposal
clear transport projections.

Desktop disposes the workspace and destroys the Web SDK before invoking Center
logout. Rust then clears active IM memory and managed Keychain data before
revoking and clearing the endpoint session. Offline cached mode exposes no IM
credential and cannot start the Web transport.

Model runtime refresh atomically replaces only the Center-owned provider set.
Logout, Center unavailability, an empty Center provider catalog, and Center
provider activation failure remove that set while retaining local providers and
the Tea runtime. A local provider configuration failure leaves Tea visible and
providerless; it does not prevent Desktop startup or selection of other
runtimes. Security-sensitive logout cancels affected work before managed
credentials are cleared.

## Migration And Rollback

The project is WIP, so the active transport is replaced directly without a
compatibility branch or persisted-data migration. Re-enabling the retained
sidecar requires restoring managed-runtime startup, Tauri `externalBin`, build
wiring, and Host channel composition together. Moving to a native SDK should
replace both WebView credential IPC and the retained sidecar in one contract
change.

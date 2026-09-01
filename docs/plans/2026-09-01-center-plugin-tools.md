# Center Plugin Tools Integration Plan

> Status: implemented. The stable human-oriented architecture is documented in
> `docs/design/center-managed-enterprise-plugins.md`; implementation and
> operations are documented in
> `docs/design/center-managed-enterprise-plugins-implementation.md`.

## Goal

Make every Center-enabled declarative HTTP plugin available automatically in every newly created Tea Agent conversation. The renderer must not select plugins, hold Center access tokens, or receive upstream credentials. Bootstrap must import and enable the supplied Overmind OpenAPI document using the supplied exported variables, and a real Agent call must be able to query issue data through Center.

## Invariants

- Center is the only component that stores upstream credentials and signs upstream requests.
- Electron main is the only Desktop component that holds the Center endpoint session and invokes plugin endpoints.
- Enabled plugin operations are projected as narrow, named HostTools. Agents never receive a generic arbitrary-HTTP tool.
- User-selected MCP state remains unchanged. Center plugin tools are mandatory main-owned tools and are not reconstructed from turn history.
- Plugin catalog failures are fail-closed: no stale cross-tenant tools are injected after logout, tenant change, or an authorization failure.
- Tool calls carry only `pluginId`, `operationId`, conversation metadata, and validated operation arguments.
- The plugin catalog is fetched on authenticated startup/login refresh, not polled per turn.

## Ownership And Contracts

1. `tea-center/internal/plugin` owns OpenAPI normalization, credential references, request signing, argument defaults, upstream execution, and audit hooks.
2. `tea-center/scripts/bootstrap-tenant.sh` owns optional, idempotent bootstrap import from external OpenAPI and variable files.
3. `tea/electron/services/centerPlugins.ts` owns the authenticated enabled-plugin snapshot, HostTool projection, and Center operation calls.
4. `tea/electron/conversation` owns mandatory-tool merging and cancellation-aware main-side HostTool dispatch.
5. Existing ACP MCP attachment code remains the transport that exposes HostTools to every current Agent runtime.

## Phase 1: Center Runtime Support

- Add a declarative HMAC-SHA256 timestamp auth profile with explicit signature, client, and timestamp header names.
- Store the HMAC client ID and secret together in the existing encrypted credential store; never return either value.
- Strip auth-managed headers from imported Agent-visible operation parameters.
- Apply JSON Schema parameter defaults when an Agent omits an optional argument.
- Add deterministic unit tests for signing, header filtering, default arguments, cancellation, and invalid credential/configuration handling.

## Phase 2: Tenant Bootstrap

- Accept OpenAPI and exported-variable paths through explicit bootstrap environment variables.
- Read `ClientID` and `SecretID` without echoing them.
- Convert non-secret exported values referenced by OpenAPI parameter examples into parameter schema defaults.
- Import through the authenticated admin plugin API, identify an existing plugin by stable display name for idempotency, and enable it.
- Add shell-level tests around payload construction/idempotency without contacting a real upstream.

## Phase 3: Desktop Main Integration

- Add typed Center plugin catalog and call methods to `ElectronCenterAuthService`.
- Build stable HostTool definitions from enabled operations; tool names include stable hashes to avoid collisions and schemas include operation parameters/body.
- Add a mandatory HostTool provider to conversation creation. Merge it with renderer-requested tools in Electron main before catalog persistence.
- Add a main-owned HostTool dispatcher to `ConversationToolBroker`; unmatched calls continue to the existing renderer-owned channel tool path.
- Propagate cancellation through the broker to Center fetch and map Center failures to stable HostTool result codes.
- Refresh/clear the plugin snapshot on authenticated Center state transitions and tenant changes.

## Phase 4: Verification

- Center: focused tests, full tests, race tests, and vet.
- Desktop: focused broker/service/plugin tests, type-check, full tests, format check, lint, UI-boundary check, and web build.
- Run tenant bootstrap against the supplied files with HTTP and host allowlist development settings.
- Confirm `/v1/endpoint/plugins` exposes enabled operations without credentials or managed auth headers.
- Execute the issue query first through Center and then through an Agent conversation, confirming the upstream result is returned through the named tool.

## Failure And Recovery

- Failed plugin catalog refresh clears the mandatory plugin snapshot unless an already authenticated same-tenant snapshot is explicitly retained for a transient Center outage.
- Authentication or tenant changes always clear the previous snapshot before refresh.
- Disabling a plugin affects conversations created or recovered after the next explicit catalog refresh; already-running ACP sessions keep their immutable MCP attachment until restarted.
- Upstream signing and execution errors return generic stable codes; secrets and upstream authorization values are never logged.

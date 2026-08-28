# ADR 0013: Trusted Local Plugin Process Protocol

- Status: Accepted
- Date: 2026-08-23

## Context

Tea Desktop needs third-party integrations for enterprise and personal systems.
The first product scope lets a local user install a Plugin, enter personal
credentials, and expose structured Actions to an Agent. Requiring Tea Center on
the invocation path would prevent offline and private-network use and would add
Tenant authorization before the local product contract is proven.

Loading third-party dynamic libraries into the Tauri process would share crash,
memory, and dependency state with the Desktop host. Treating a Skill, prompt, or
MCP configuration as the Plugin contract would also mix declarative context
with executable authority and would not provide one stable lifecycle for Tea,
Claude Code, and Codex.

The Plugin interface is externally implementable, so identity, versioning,
bounds, credentials, errors, cancellation, recovery, and conformance must be
defined before Desktop launches a Plugin.

## Decision

Tea defines a product-neutral Local Plugin Protocol V1 in the standalone
`tea-plugin-protocol` crate and matching JSON Schema/documentation. A Plugin is
a user-installed native executable launched as a child process by Desktop. It
communicates through a bounded framed protocol over stdin/stdout and declares an
immutable `plugin.json` manifest.

The manifest owns:

- protocol, Plugin, Action, and publisher identities and versions;
- exact per-platform package entry points;
- credential field presentation metadata, never values;
- bounded Action input/output JSON Schemas;
- descriptive `read` or `write` effect metadata.

Desktop owns package activation, process lifecycle, Connection selection,
credential resolution, enablement, and Action exposure. Credentials are stored
in the operating-system credential facility and are sent only through the
private process protocol after the host selects a Connection. They never enter
Vue state, conversation tool arguments, prompts, events, SQLite, or diagnostics.

Plugin Actions map into the existing `ConversationToolBroker`. `tea-rs` remains
product-neutral and receives only ordinary validated tool definitions and
results.

Installing and enabling a Plugin trusts local native code. Process separation
is a crash/lifecycle boundary, not a security sandbox. Desktop does not enforce
the Plugin's external network destinations in V1 and must not claim otherwise.

## Alternatives Considered

### Center-only Connector Services

Deferred because personal credentials, private networks, offline operation, and
Desktop-local Agents do not require a server hop. A later remote execution
adapter may reuse Plugin/Connection/Action semantics but is not the V1 local
process protocol.

### In-process dynamic libraries

Rejected because ABI compatibility, crashes, memory corruption, dependency
conflicts, and unload behavior would share the Desktop trust boundary.

### MCP as the product contract

Rejected because MCP is one possible tool transport, not Tea's package,
credential, installation, enablement, compatibility, or lifecycle model.

### WebView plugins

Rejected because the WebView must not receive credentials, unrestricted native
access, process handles, or Agent orchestration responsibility.

### WASI sandbox first

Deferred because current integrations need ordinary provider SDKs and network
access, while the confirmed V1 model treats installed Plugins as trusted local
applications. A sandbox can be evaluated when untrusted-code execution becomes
a real requirement.

## Consequences

### Positive

- Third parties implement one small contract without Desktop source access.
- Plugin crashes and protocol failures do not directly crash the Tauri process.
- Tea, Claude Code, and Codex consume the same Action abstraction.
- Keychain credentials and model-visible tool arguments remain separate.
- A future Center credential source can replace the credential provider without
  changing Plugin manifests or Actions.

### Negative

- Native packages must be built for each supported platform.
- Process startup, framing, cancellation, upgrades, and conformance add host
  complexity.
- V1 cannot protect the user from a malicious Plugin running with the user's OS
  permissions.
- Desktop cannot independently verify Plugin-owned network behavior.

### Neutral

- `read`/`write` effect is metadata only in V1; both execute when the Plugin and
  Connection are enabled.
- Manual unsigned packages require explicit trust confirmation and digest
  recording. Signing is required before automatic updates or a marketplace.

## Failure And Recovery

- Invalid manifests/packages are rejected before activation.
- A failed upgrade retains the prior compatible generation.
- Handshake mismatch, timeout, malformed output, crash, disable, uninstall, or
  application shutdown terminates the affected process and fails pending calls.
- Disabling a Plugin prevents new calls but does not silently delete Credentials,
  Connections, Skills, Agent Role references, or conversation evidence.
- Restart reconstructs installed/enabled metadata and resolves credentials from
  Keychain; it never persists credential values as recovery data.

## Migration

The existing Overmind Connector Service is WIP. Its provider client and
normalization logic may be reused behind a Local Plugin protocol adapter; no
compatibility shim is required for unreleased HTTP Connector assumptions.

## Rollback

Disable local Plugin installation and Action exposure while leaving package and
Connection metadata intact. Existing non-Plugin conversations and runtimes
remain available. Do not fall back to prompt parsing or unrestricted shell/HTTP
execution.

## References

- `docs/extensions/local-plugin-v1.md`
- `docs/design/desktop-management-centers.md`
- `docs/plans/2026-08-23-local-plugin-management-implementation.md`
- `docs/adr/0010-task-scoped-channel-history-tool.md`

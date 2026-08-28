# Tea aPaaS And Local Plugin Roadmap

> Status: proposed
> Updated: 2026-08-23
> Scope: `tea-desktop`, `tea-rs`, `tea-center`, third-party local Plugins, and
> first-party reference Plugins

## Goal

Build the first integration platform around third-party Plugins installed and
executed by Tea Desktop. A user explicitly configures personal credentials,
Desktop stores them in the operating-system credential facility, and an Agent
invokes the Plugin's structured Actions locally.

The future aPaaS control plane may catalog Plugins and manage per-Tenant,
per-user credentials, but it is not on the first Plugin invocation path. The
local protocol must therefore avoid Center-specific types while retaining a
replaceable credential source and stable Plugin identity.

This roadmap is ordered by dependency and product risk, not by calendar date.

## Confirmed Decisions

1. Third parties can implement and install Plugins through a public Tea Plugin
   interface.
2. Plugin code executes locally on the Desktop endpoint.
3. Credentials are entered by the local user and stored in Keychain/Credential
   Manager. Vue state, Agent prompts, tool arguments, events, SQLite, and logs
   never contain credential values.
4. The product model is `Plugin`, `Connection`, and `Action`.
5. Connections belong to the local Desktop user. The host, not the model,
   selects which Connection is available to a conversation or Agent Role.
6. Actions use bounded input/output schemas and typed results.
7. Read and write Actions are equally callable in V1. The only enforcement is
   whether the Plugin/Connection is enabled. `effect` remains descriptive
   metadata for UI, diagnostics, and future policy.
8. A Plugin owns its external-system hosts, transport, redirects, and provider
   behavior. Desktop does not maintain per-Plugin network allowlists.
9. Actions are exposed through the existing provider-neutral host-tool path so
   Tea, Claude Code, and Codex use the same integration.
10. OIDC, multi-Tenant authorization, cloud credential delivery, server-side
    execution, centralized approval, and strong remote audit are future phases,
    not prerequisites for local Plugins.

## Trust Model

A third-party Plugin is user-installed native code, not declarative content.
For V1, installing and enabling it means the user trusts it similarly to a
locally installed CLI application.

Process separation provides crash and lifecycle isolation; it is not a security
sandbox. A malicious Plugin may use the current OS user's ambient permissions
or ignore the network behavior declared by its publisher. Desktop cannot claim
that a Plugin's hard-coded network policy is enforced by Tea unless a real OS
sandbox is introduced later.

The V1 security boundary is therefore deliberately narrow:

- Installation and first enablement are explicit user actions.
- Desktop never loads third-party dynamic libraries into its own process.
- Desktop launches an exact executable with argument arrays and no shell.
- Only the owning Plugin receives credentials for the selected Connection.
- Credentials travel only over the private local Plugin protocol and are
  excluded from ordinary invocation DTOs, diagnostics, and model-visible data.
- Protocol messages, schemas, inputs, outputs, time, and process concurrency are
  bounded.
- Disabling or uninstalling a Plugin terminates its processes and prevents new
  Action calls.
- Installed package identity, version, digest, and source are recorded locally.
- Unpackaged directory Plugins require an explicit developer mode. A manually
  installed unsigned package requires a one-time native-code trust warning and
  records its digest. Publisher signing and verification are required before
  automatic updates or a marketplace.

This is a practical V1 boundary, not a guarantee against malicious local code.

## Product Model

### Plugin

A Plugin is an installed implementation for one external system or local
capability. It owns provider-specific API logic and declares credential fields
and Actions through an immutable manifest.

```text
Plugin
  id
  version
  protocol version
  publisher metadata
  platform entry point
  credential schema
  Action definitions
  installed package digest
  enabled state
```

### Connection

A Connection is one local user's configured account for one Plugin.

```text
Connection
  id
  Plugin id
  local display name
  non-secret configuration
  credential reference
  enabled state
  last connection-test result
```

The Connection record contains a Keychain reference, never credential values.
The first release may support one enabled Connection per Plugin in an Agent
context while keeping IDs capable of representing multiple accounts.

### Action

An Action is one structured operation an Agent can invoke.

```json
{
  "id": "task.update_status",
  "version": "1.0.0",
  "description": "Update one task status",
  "inputSchema": {},
  "outputSchema": {},
  "effect": "write"
}
```

V1 `effect` values are `read` and `write`. They do not trigger approval or
authorization differences in V1. Action IDs, versions, schemas, and effect
metadata are Plugin-owned manifest facts and cannot change during one running
Plugin generation.

## Target Architecture

```text
Vue Plugin settings / Agent selection
              |
              v
Plugin feature store and typed PluginClient
              |
              v
Tauri commands (configuration only)
              |
              v
Desktop PluginService
  +-- PluginPackageInstaller
  +-- PluginRegistry
  +-- PluginProcessHost
  +-- ConnectionRepository
  +-- CredentialProvider
  +-- PluginActionExecutor
              |
              +------> OS Keychain (V1)
              |
              v
third-party Plugin process
              |
              v
external system

ConversationRuntime host tool
  -> ConversationToolBroker
  -> PluginActionExecutor
  -> the same Plugin process
```

Vue manages installation, configuration, enablement, and projections. It does
not launch processes, retrieve credentials, construct Plugin RPC, or invoke an
Action on behalf of a model.

`tea-rs` remains product-neutral. Desktop converts enabled Plugin Actions into
`ToolSpec`/host-tool definitions and handles calls through its existing tool
broker. No Overmind, Plugin package, Keychain, or Tauri type enters `tea-rs`.

## Desktop Management Workspace

Tea Desktop has one first-class Management workspace with four centers. The
existing Settings page remains limited to application preferences such as
language, default runtime, and layout behavior.

| Center            | Owns                                                                                                              | Does not own                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Credential Center | local credential metadata, secret reference, source, status, test result, deletion                                | Plugin process lifecycle, Agent selection, raw secret projection    |
| Plugin Center     | package install/upgrade/uninstall, enablement, process health, Actions, Connections                               | credential values, Skill content, Agent prompt composition          |
| Skill Center      | installed Skill releases, provenance, digest, trust, resources, enablement                                        | executable authority, Plugin credentials, runtime sessions          |
| Agent Role Center | role drafts/releases and references to runtime/model, prompt segments, Skill releases, Plugin Connections/Actions | copies of Skills, credentials, Plugin manifests, conversation facts |

The internal `Connection` binds one installed Plugin to one Credential record
and non-secret configuration. Credentials are managed independently so their
source can later change from local Keychain to a Tenant/user-managed Center
source without changing Plugin or Agent Role contracts.

References use stable IDs and revisions. Deleting or disabling a referenced
Credential, Plugin, Connection, Skill, Action, runtime, or model never silently
removes it from an Agent Role. The Role becomes unavailable with explicit
dependency errors until the reference is repaired or a new Role revision is
saved.

The workspace uses one primary rail entry and an internal left navigation for
the four centers. Each center uses a dense list/detail layout suited to repeated
administration. It does not add four icons to the narrow `WorkspaceRail` or put
nested cards inside Settings.

The conversation composer gains a Role selector distinct from runtime and model
selectors. Selecting a Role for a new conversation resolves and records one
immutable Role revision. The proposed V1 behavior for changing Role in an
existing conversation is to start a new conversation with that Role; mutating
prompt, Skills, tools, and Plugin access in place would make recovery and
cross-runtime behavior ambiguous.

See `docs/design/desktop-management-centers.md` for navigation, state, and
interaction details.

## Plugin Protocol V1

### Package

A distributable Plugin package contains:

```text
plugin.json
bin/<platform>/<executable>
LICENSE
optional static documentation/assets
```

`plugin.json` declares package identity, publisher, protocol compatibility,
platform entry points, credential schema, and Action schemas. It cannot declare
shell commands, arbitrary launch arguments, environment-variable interpolation,
Desktop UI code, prompt injection, Skills, MCP servers, or dynamic tool URLs.

Installation validates archive paths, file count, uncompressed size, manifest
schema, identifiers, executable location, duplicate Actions, and package digest.
Activation is atomic. A failed upgrade leaves the previous version available.

### Transport

Desktop launches one Plugin process using a framed JSON-RPC-like protocol over
stdin/stdout. Stderr is bounded diagnostic output and must be redacted by the
Plugin. Shell interpolation, listening TCP ports, and Plugin-initiated Desktop
IPC are not part of V1.

The minimal lifecycle is:

```text
initialize
test_connection
invoke
cancel
shutdown
```

`initialize` negotiates one protocol version and validates manifest/runtime
identity. `invoke` includes an invocation ID, Action ID/version, bounded input,
and private resolved credential envelope. The Agent-visible Action arguments do
not contain credentials or provider endpoints.

Results are:

```text
succeeded(output)
failed(code, retryable, safe message)
unknown(code, safe message)
```

`unknown` is retained even though V1 does not impose write approval or retry
policy. It prevents Desktop from falsely reporting success after a timeout or
lost response. Automatic retry remains Plugin-owned in V1.

### Credential Boundary

Desktop defines a replaceable port:

```text
CredentialProvider.resolve(pluginId, connectionId) -> credential envelope
```

V1 uses `OsKeychainCredentialProvider`. A future aPaaS implementation may add a
Center-backed provider that fetches/decrypts a Tenant/user-managed credential
onto an authorized endpoint. Plugin manifests and Action invocation contracts
do not change when the credential source changes.

The manifest defines credential field names and presentation metadata. It must
not contain credential values. Credential validation happens locally during
Connection setup and `test_connection`.

## Recommended Priority

| Rank | Capability                                             | Reason                                                                                                          |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| P0   | Plugin protocol, trust model, and conformance fixtures | Third-party implementations cannot begin safely until package, lifecycle, bounds, and compatibility are stable. |
| P0   | Desktop Plugin Host and Keychain Connection management | This is the execution and credential boundary required by every Plugin.                                         |
| P0   | Overmind reference Plugin                              | Validates the public interface against a real read/write enterprise system.                                     |
| P1   | Desktop Management workspace                           | Users need first-class Credential, Plugin, Skill, and Agent Role centers rather than scattered settings.        |
| P1   | Local Skill and Agent Role composition                 | Makes installed capabilities directly usable through stable Role selection in conversations.                    |
| P1   | Third-party SDK and developer tooling                  | Converts the protocol into an implementable platform rather than an internal adapter.                           |
| P2   | OIDC and durable aPaaS identity                        | Required for later cloud catalogs and credential management, not local execution.                               |
| P2   | Server Plugin catalog and credential delivery          | Adds Tenant/user management after the local contract is proven.                                                 |
| P2   | Model catalog and key management                       | Supplies centrally managed model choices and credentials.                                                       |
| P2   | IM bootstrap and managed catalog synchronization       | Adds server-managed sources to the already working local centers.                                               |
| P3   | Optional sandbox and remote execution                  | Add only when stronger trust or headless/cloud Agent requirements are confirmed.                                |

## Delivery Roadmap

### R0 - Freeze The Local Plugin Boundary

Outcome: an external developer can implement against a small reviewed contract
without depending on Desktop internals.

- [ ] Record an ADR for the native-process trust model, package format, protocol
      compatibility, credential flow, and host-tool ownership.
- [ ] Specify `plugin.json`, identifiers, semantic versions, credential schema,
      Action schema, `effect`, and package bounds.
- [ ] Specify framed transport, lifecycle methods, deadlines, cancellation,
      result states, error codes, and diagnostic redaction.
- [ ] Define compatibility rules for Desktop protocol range, Plugin version,
      Action version, and unknown fields.
- [ ] Publish JSON schemas plus valid and invalid protocol fixtures.
- [ ] Define the V1 non-goals explicitly: no sandbox guarantee, remote execution,
      background daemon, arbitrary UI, prompt injection, MCP injection, automatic
      updates, cloud credentials, or server authorization.

Exit gate:

- [ ] A standalone conformance runner can distinguish a compatible Plugin from
      malformed, oversized, hanging, identity-mismatched, and crashing Plugins.
- [ ] Security documentation states that enabling a Plugin trusts local native
      code and that network behavior is not enforced by Desktop.

### R1 - Desktop Plugin Host And Connections

Outcome: Desktop can install, run, stop, and invoke a third-party Plugin while
keeping credentials out of the WebView and Agent-visible protocol.

- [ ] Add `src-tauri/src/plugins/` with package, registry, process host,
      connection, credentials, invocation, and command ownership separated by real
      behavior.
- [ ] Implement safe package inspection and atomic installation under the
      application data directory.
- [ ] Launch exact executables without a shell; bound process count, startup,
      messages, stdout/stderr, invocation time, and shutdown.
- [ ] Implement protocol handshake and reject manifest/runtime identity or
      version mismatch.
- [ ] Implement Connection metadata persistence and generic credential forms
      driven by bounded manifest schemas.
- [ ] Store credential envelopes through `OsKeychainCredentialProvider`; use a
      unique service/account identity per Plugin and Connection.
- [ ] Implement install, uninstall, configure, test, enable, disable, list, and
      status commands with stable error codes.
- [ ] Add the Management workspace shell plus Credential Center and Plugin
      Center list/detail flows; keep application preferences in Settings.
- [ ] Make Credential a separate metadata/resource boundary and bind it to a
      Plugin through Connection rather than embedding secrets in Plugin settings.
- [ ] On disable/uninstall, stop processes, reject new calls, cancel pending
      calls, and remove credentials when the user requests Connection deletion.
- [ ] Keep a local, redacted diagnostic journal for process/version/error state;
      do not claim strong audit integrity.
- [ ] Test malicious archives, path traversal, oversized schemas/messages,
      executable substitution, hangs, crashes, cancellation, duplicate calls,
      Keychain failure, restart, upgrade failure, and secret redaction.

Exit gate:

- [ ] Vue never receives a credential value or raw Plugin process handle.
- [ ] A disabled Plugin cannot accept new Action invocations and has no running
      process after the bounded shutdown period.
- [ ] Restart restores installed/enabled metadata and Connection references
      without copying secrets into SQLite.

### R2 - Agent Action Bridge And Overmind Reference Plugin

Outcome: all supported Agent runtimes can use Overmind through the same public
Plugin protocol used by third parties.

- [ ] Convert enabled Plugin Actions into namespaced host-tool definitions with
      deterministic collision handling.
- [ ] Bind one host-selected Connection outside model-visible Action arguments.
- [ ] Route `ConversationToolBroker` calls to `PluginActionExecutor` and return
      bounded structured success/failure/unknown results.
- [ ] Close Plugin tool scopes on cancellation, terminal conversation state,
      Plugin disable, Connection disable, process crash, or app shutdown.
- [ ] Implement Overmind as an out-of-process reference Plugin using the public
      manifest and protocol; reuse provider mapping/domain logic where coherent.
- [ ] Cover Overmind query, details, status update, comment, pagination,
      provider errors, timeout, cancellation, and ambiguous write outcomes.
- [ ] Verify Tea, Claude Code, and Codex behavior through the existing
      `ConversationRuntime` host-tool contract without runtime-name branches in UI.
- [ ] Add a user-visible per-conversation or Agent configuration for choosing
      which enabled Plugin Connections are exposed.
- [ ] Surface Role dependency health so a disabled Plugin, Connection, or
      Credential makes the affected Role unavailable instead of reducing its
      Actions silently.

Exit gate:

- [ ] Overmind passes the standalone third-party conformance suite.
- [ ] The model cannot select another Connection, supply credentials, or invoke
      a disabled Plugin.
- [ ] Read and write Actions both execute without an approval gate, matching the
      confirmed V1 policy.

### R3 - Local Skill And Agent Role Centers

Outcome: users can manage local Skills, compose them with Plugin Actions into
Agent Roles, and choose a ready Role directly from the conversation composer.

- [ ] Add the Management workspace shell with internal navigation for
      Credentials, Plugins, Skills, and Agent Roles.
- [ ] Add a local immutable Skill release catalog backed by the existing
      bounded `tea-coding` resource model.
- [ ] Implement Skill install/import, inspect, enable/disable, update, remove,
      provenance, digest, trust, compatibility, and dependent-Role projections.
- [ ] Add local immutable Agent Role revisions that reference runtime/model,
      trusted prompt segments, Skill releases, Plugin Connections, and Actions.
- [ ] Implement host-owned Role resolution with typed dependency failures and no
      silent partial activation.
- [ ] Add the Agent Role editor with dependency pickers and effective
      configuration preview.
- [ ] Separate Role, runtime, and model concepts in the conversation composer.
- [ ] Bind an exact Role revision and resolved dependency revisions when a new
      conversation is created.
- [ ] When a user chooses another Role in an active conversation, preserve the
      draft and start a new Role-bound conversation in V1.
- [ ] Add dependency-aware disable/delete flows across all four centers.

Exit gate:

- [ ] A user can create a Role from an installed Skill and enabled Plugin
      Connection, select it in the composer, and run a conversation with the exact
      resolved configuration.
- [ ] Disabling any required dependency makes the Role explicitly unavailable
      without rewriting the Role or silently dropping capabilities.
- [ ] Credentials and Skill/Plugin contents are referenced, not copied into the
      Role record or frontend state.

### R4 - Third-Party Developer Experience

Outcome: a customer can build, test, package, install, and diagnose a Plugin
without Tea source access.

- [ ] Publish the protocol specification, JSON schemas, threat model,
      compatibility policy, and a minimal example Plugin.
- [ ] Provide an initial SDK for the language used by the Overmind reference
      Plugin; add another language only after demand is confirmed.
- [ ] Provide a CLI for manifest validation, local protocol simulation,
      conformance tests, and package creation.
- [ ] Document credential schema, Action design, error mapping, cancellation,
      redaction, versioning, and safe diagnostics.
- [ ] Add explicit local installation and developer-mode flows.
- [ ] Define publisher/package signing before enabling automatic update or a
      public marketplace; do not block manual V1 development on marketplace work.

Exit gate:

- [ ] A sample third party can implement and run one Plugin using only published
      artifacts and documentation.
- [ ] A protocol-breaking Plugin upgrade is rejected while the prior installed
      generation remains usable.

### R5 - OIDC And aPaaS Identity Foundation

Outcome: Center establishes durable Tenant/user/device identity independently
from local Plugin execution.

- [ ] Complete production OIDC directory mapping and Desktop device-bound login.
- [ ] Persist identities, memberships, endpoint sessions, refresh rotation, and
      revocation.
- [ ] Define Tenant/Workspace membership and active Workspace selection.
- [ ] Add scope-isolation tests, secret-manager port, audit/outbox, backup, and
      recovery for Center-owned facts.
- [ ] Keep local Plugins usable offline without implying server authorization.

Exit gate:

- [ ] Desktop can authenticate and recover a scoped endpoint session securely.
- [ ] Local Plugin invocation remains functional when Center is unavailable,
      subject only to local Plugin/Connection enablement.

### R6 - Cloud Catalog And Per-User Credential Management

Outcome: a Tenant can manage Plugin availability and each user's credential
material centrally while execution still occurs on Desktop.

- [ ] Define server Plugin catalog entries that reference the same stable Plugin
      and protocol identities used locally.
- [ ] Define per-Tenant Plugin availability and per-user Connection metadata.
- [ ] Design an end-to-end encrypted or endpoint-bound credential delivery
      protocol by ADR; Center must not return raw secrets to Vue.
- [ ] Implement `CenterCredentialProvider` behind the same local credential port.
- [ ] Define conflict and precedence between local credentials and managed
      credentials; never silently replace one with the other.
- [ ] Add revocation, rotation, endpoint loss, offline expiry, and Tenant removal
      behavior.
- [ ] Decide whether managed policy may force-disable a Plugin. This is separate
      from the V1 local enable switch and requires an explicit product decision.

Exit gate:

- [ ] Changing credential source does not change the Plugin manifest or Action
      protocol.
- [ ] A revoked managed credential cannot start a new invocation after the
      documented propagation/expiry window.

### R7 - Managed Models, IM, Skills, And Agent Roles

Outcome: Center distributes coherent Agent configuration after identity and
Plugin catalogs exist.

- [ ] Add model definitions, model list policy, secret references, and routing.
      Provider availability is not restricted by an Agent runtime allowlist.
- [ ] Add provider-neutral IM account bootstrap and short-lived connection
      credentials.
- [ ] Add immutable Skill releases with provenance, trust, digest, and bounded
      artifact distribution.
- [ ] Add immutable Agent Role releases that compose prompts, Skills, model
      policy, and allowed Plugin Action references.
- [ ] Synchronize managed Skill and Agent Role releases into the existing local
      centers with explicit source and precedence rather than parallel screens.
- [ ] Resolve one versioned endpoint configuration revision rather than merging
      independent mutable lists in Desktop.
- [ ] Preserve resolved role, model, Skill, Plugin, and Action versions in
      conversation metadata for deterministic recovery.

Exit gate:

- [ ] An Agent Role can expose only locally installed, enabled, compatible
      Plugin Actions and a host-selected Connection.
- [ ] Skills and prompts cannot grant or enable a Plugin Action.
- [ ] Credential, Plugin, Skill, and Role state is managed from the four centers
      without exposing secrets or duplicating authoritative records in Role state.
- [ ] A Role selected in the composer records the exact Role, Skill, Plugin,
      Action, runtime, and model revisions used by the conversation.

### R8 - Optional Stronger Isolation And Remote Execution

Outcome: add only the deployment modes justified by actual customer needs.

- [ ] Evaluate OS sandboxing, WASI, containers, or brokered capabilities if
      customers require untrusted Plugin execution rather than trusted local code.
- [ ] Add signed catalogs and automatic updates only with rollback and publisher
      identity verification.
- [ ] Define a remote execution adapter only for headless/cloud Agents or
      centrally controlled credentials; reuse `Plugin`/`Connection`/`Action`
      semantics without making the V1 local protocol a network service.
- [ ] Add strong server-side authorization and audit only where execution passes
      through an authoritative server or enterprise gateway.

## Deferred By Design

The following are intentionally absent from V1:

- Tenant or Workspace authorization on local Action calls
- Different enforcement for read and write Actions
- Mandatory write confirmation or idempotency policy
- Desktop-managed Plugin network allowlists
- Strong claims about Plugin confinement
- Server-issued execution grants
- Remote Connector Services
- Marketplace, review, billing, and automatic updates
- Plugin-provided Vue components
- Plugin-provided prompts, Skills, MCP servers, or arbitrary tools
- Background execution after Tea Desktop exits
- Cross-device credential synchronization
- Centralized tamper-resistant audit

Deferral does not mean these can be added invisibly later. Any item that changes
authority, credential exposure, or execution location requires an ADR and a
versioned contract.

## Cross-Cutting Acceptance Matrix

| Dimension     | V1 evidence                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| Protocol      | handshake, versions, strict schemas, bounds, unknown fields, malformed frames         |
| Process       | exact executable, no shell, crash isolation, timeout, cancellation, shutdown, restart |
| Package       | traversal defense, digest, atomic activation, failed upgrade rollback, explicit trust |
| Credentials   | Keychain only, per-Connection identity, redaction, deletion, storage failure          |
| Actions       | namespace collision, schema validation, success/failure/unknown, disabled rejection   |
| Agent runtime | common host-tool mapping, bounded calls/results, scope closure, recovery              |
| UI            | install/configure/test/enable/disable/uninstall states, no credential projection      |
| Compatibility | Desktop range, Plugin version, Action version, conformance suite                      |

## Immediate Next Slice

The next slice is local and does not require Center:

1. Approve the V1 trust model: a third-party Plugin is trusted local native
   code, and process isolation is not a sandbox.
2. Write the Plugin protocol ADR and `plugin.json`/transport schemas.
3. Build the standalone conformance runner before the Desktop process host.
4. Implement Desktop package installation, process lifecycle, Connection
   metadata, and `OsKeychainCredentialProvider`.
5. Refactor Overmind into the first public-protocol Plugin and drive one read
   and one write Action through `ConversationToolBroker`.
6. Build the Management workspace and local Skill/Agent Role vertical slice.
7. Publish the initial SDK and example only after the Overmind vertical slice
   exposes gaps in the protocol.

This ordering validates the externally committed boundary before investing in
OIDC, Tenant policy, cloud credentials, or a Plugin marketplace.

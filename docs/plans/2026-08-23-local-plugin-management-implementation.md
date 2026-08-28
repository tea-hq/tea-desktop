# Local Plugin And Management Centers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a third-party local Plugin protocol, Desktop Plugin Host,
Credential/Plugin/Skill/Agent Role management centers, and role-bound Agent
execution through the existing conversation runtime abstraction.

**Architecture:** A standalone Rust `tea-plugin-protocol` crate owns public DTOs,
strict validation, framing, and conformance fixtures. Tauri application services
own package/process/credential/Skill/Role facts and expose typed IPC adapters;
Vue stores project those facts into one Management workspace. Plugin Actions
enter Tea, Claude Code, and Codex only through `ConversationToolBroker`, while
Agent Role revisions resolve immutable references before conversation creation.

**Tech Stack:** Rust 2021, Serde, JSON Schema, SemVer, Tokio subprocess I/O,
Keyring, SQLite/rusqlite, Tauri 2, Vue 3, TypeScript, Pinia, Vitest, Tailwind CSS.

---

## Scope And Execution Rules

- Implement Tasks 1-3 before exposing any third-party executable to Desktop.
- Use TDD at the owning layer; run the focused test after each red/green step.
- Do not add compatibility aliases for WIP interfaces.
- Do not commit unless the user explicitly requests it. The commit commands
  below are intentional checkpoints, not authorization to run them.
- Keep all display text in `src/locales/en.ts` and `src/locales/zh-CN.ts`.
- Treat third-party native Plugins as user-trusted code; process separation is
  not described as a sandbox.

## Task 1: Public Manifest Contract And ADR

**Files:**

- Create: `docs/adr/0013-local-plugin-process-protocol.md`
- Create: `docs/extensions/local-plugin-v1.md`
- Create: `src-tauri/crates/plugin-protocol/Cargo.toml`
- Create: `src-tauri/crates/plugin-protocol/src/lib.rs`
- Create: `src-tauri/crates/plugin-protocol/src/error.rs`
- Create: `src-tauri/crates/plugin-protocol/src/manifest.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/manifest.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/fixtures/valid/overmind.json`
- Create: `src-tauri/crates/plugin-protocol/tests/fixtures/invalid/unknown-field.json`
- Create: `src-tauri/crates/plugin-protocol/tests/fixtures/invalid/duplicate-action.json`
- Create: `docs/extensions/schemas/local-plugin-manifest-v1.schema.json`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write failing manifest tests**

Test strict decoding, protocol version, reverse-domain Plugin ID, SemVer,
platform entry point, bounded credential fields, unique Action ID/version,
`read|write` effect, object-root JSON schemas, field/depth/count limits, and
unknown-field rejection.

```rust
#[test]
fn valid_reference_manifest_round_trips() {
    let manifest = PluginManifest::decode(include_bytes!(
        "fixtures/valid/overmind.json"
    ))
    .unwrap();
    assert_eq!(manifest.id(), "im.netease.tea.overmind");
    assert_eq!(manifest.actions().len(), 2);
}

#[test]
fn duplicate_action_is_rejected() {
    assert_eq!(
        PluginManifest::decode(include_bytes!(
            "fixtures/invalid/duplicate-action.json"
        ))
        .unwrap_err()
        .code(),
        PluginProtocolErrorCode::InvalidManifest
    );
}
```

**Step 2: Run tests and confirm red**

Run:

```bash
cargo test --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml --test manifest
```

Expected: fail because `tea_plugin_protocol` and manifest types do not exist.

**Step 3: Implement the minimum public contract**

Expose only validated, immutable accessors:

```rust
pub const PLUGIN_PROTOCOL_VERSION: &str = "1.0.0";

pub struct PluginManifest { /* private validated fields */ }

impl PluginManifest {
    pub fn decode(bytes: &[u8]) -> Result<Self, PluginProtocolError>;
    pub fn validate(self) -> Result<Self, PluginProtocolError>;
    pub fn id(&self) -> &str;
    pub fn actions(&self) -> &[ActionDefinition];
}
```

Use `#[serde(deny_unknown_fields)]`, `semver::Version`, bounded JSON depth/size,
and stable generic errors that never echo manifest payloads.

**Step 4: Write the ADR and protocol document**

Record ownership, trusted-native-code model, package identity, manifest fields,
credential exclusion, versioning, alternatives, failure, migration, rollback,
and recovery. Mark transport and package sections not yet implemented.

**Step 5: Verify green**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all pass and the workspace recognizes `tea-plugin-protocol`.

**Commit checkpoint (only when explicitly requested):**

```bash
git add docs/adr/0013-local-plugin-process-protocol.md \
  docs/extensions/local-plugin-v1.md src-tauri/Cargo.toml \
  src-tauri/Cargo.lock src-tauri/crates/plugin-protocol
git commit --signoff -m "feat(plugins): define local plugin manifest protocol"
```

## Task 2: Framed Process Protocol

**Files:**

- Create: `src-tauri/crates/plugin-protocol/src/message.rs`
- Create: `src-tauri/crates/plugin-protocol/src/frame.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/messages.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/framing.rs`
- Modify: `src-tauri/crates/plugin-protocol/src/lib.rs`
- Modify: `docs/extensions/local-plugin-v1.md`

**Step 1: Write failing tests**

Cover initialize identity/version negotiation, test-connection, invoke, cancel,
shutdown, succeeded/failed/unknown results, duplicate request IDs, maximum frame
size, truncated frame, invalid UTF-8/JSON, secret-safe errors, and cancellation.

```rust
#[test]
fn invocation_credentials_are_separate_from_model_input() {
    let request = Request::invoke(
        "invocation-1",
        "task.query",
        json!({"query":"open"}),
        CredentialEnvelope::new(json!({"token":"secret"})).unwrap(),
    )
    .unwrap();
    assert_eq!(request.public_input(), &json!({"query":"open"}));
    assert!(!format!("{request:?}").contains("secret"));
}
```

**Step 2: Implement length-prefixed framing and DTOs**

Use an unsigned 32-bit big-endian byte length followed by one UTF-8 JSON object.
Set conservative constants for frame size, JSON depth, input/output, credential
envelope, identifiers, and safe diagnostics. Implement a redacted `Debug` for
credential-bearing request types.

**Step 3: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml
```

Expected: all protocol tests pass, including malformed-frame fixtures.

**Commit checkpoint:**

```bash
git add src-tauri/crates/plugin-protocol docs/extensions/local-plugin-v1.md
git commit --signoff -m "feat(plugins): add framed process protocol"
```

## Task 3: Standalone Conformance Runner

**Files:**

- Create: `src-tauri/crates/plugin-protocol/src/bin/tea-plugin-conformance.rs`
- Create: `src-tauri/crates/plugin-protocol/src/conformance.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/conformance.rs`
- Create: `src-tauri/crates/plugin-protocol/tests/fixtures/plugin/fixture-plugin.rs`
- Modify: `src-tauri/crates/plugin-protocol/src/lib.rs`
- Modify: `docs/extensions/local-plugin-v1.md`

**Step 1: Write failing conformance tests**

Build a fixture executable and test compatible, identity-mismatched, hanging,
crashing, malformed-output, oversized-output, secret-leaking-diagnostic, and
unsupported-version behaviors.

**Step 2: Implement runner**

```text
tea-plugin-conformance <plugin.json> --executable <path>
  validate package identity
  launch without shell
  initialize
  test_connection with fixture credentials
  invoke declared fixture Actions when marked testable
  cancel a bounded invocation
  shutdown
  emit JSON report and non-zero status on failure
```

The runner must redact credentials and terminate the child on timeout.

**Step 3: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml --test conformance
cargo run --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml \
  --bin tea-plugin-conformance -- --help
```

Expected: fixtures are classified deterministically; help exits successfully.

## Task 4: Safe Plugin Package Installation

**Files:**

- Create: `src-tauri/src/plugins/mod.rs`
- Create: `src-tauri/src/plugins/package.rs`
- Create: `src-tauri/src/plugins/error.rs`
- Create: `src-tauri/src/plugins/package_test.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write failing package tests**

Test traversal, absolute/Windows paths, symlinks, file count, compressed and
expanded sizes, missing entry point, digest mismatch, duplicate ID/version,
atomic activation, failed upgrade rollback, and developer-directory mode.

**Step 2: Implement installer**

Install into an app-data staging directory, validate before activation, set
executable permission only on the declared entry point, fsync/rename atomically,
and retain the prior generation until the new one handshakes successfully.

**Step 3: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugins::package
```

Expected: all malicious archive and rollback cases pass.

## Task 5: Credential Provider And Connection Repository

**Files:**

- Create: `src-tauri/src/credentials/mod.rs`
- Create: `src-tauri/src/credentials/model.rs`
- Create: `src-tauri/src/credentials/provider.rs`
- Create: `src-tauri/src/credentials/keychain.rs`
- Create: `src-tauri/src/credentials/repository.rs`
- Create: `src-tauri/src/credentials/commands.rs`
- Create: `src-tauri/src/plugins/connection.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write failing provider/repository tests**

Use a fake credential provider. Cover schema validation, unique
Plugin/Connection key identities, metadata-only SQLite rows, replace, remove,
Keychain unavailable, orphan Plugin, reference blocking, corrupt storage, and
redacted command serialization.

**Step 2: Implement ports and local adapter**

```rust
pub trait CredentialProvider: Debug + Send + Sync {
    fn put(&self, key: &CredentialKey, value: CredentialEnvelope) -> Result<(), CredentialError>;
    fn resolve(&self, key: &CredentialKey) -> Result<CredentialEnvelope, CredentialError>;
    fn remove(&self, key: &CredentialKey) -> Result<(), CredentialError>;
}
```

Persist `CredentialRecord` and `PluginConnection` metadata in SQLite. Never
return `secret_ref` or credential fields from Tauri commands.

**Step 3: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml credentials plugins::connection
```

Expected: metadata and fake secrets round-trip independently; serialized DTOs
contain no secret values.

## Task 6: Plugin Process Host And Application Service

**Files:**

- Create: `src-tauri/src/plugins/process.rs`
- Create: `src-tauri/src/plugins/registry.rs`
- Create: `src-tauri/src/plugins/service.rs`
- Create: `src-tauri/src/plugins/commands.rs`
- Create: `src-tauri/src/plugins/test_plugin.rs`
- Modify: `src-tauri/src/plugins/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write failing lifecycle tests**

Cover exact executable/argument launch, no shell, handshake mismatch, one
generation per Plugin, bounded concurrent invocations, credential resolution,
timeout, cancellation, crash, disable, uninstall, application shutdown, stale
responses, and safe diagnostics.

**Step 2: Implement `PluginService`**

`PluginService` coordinates package registry, process host, Connection
repository, and `CredentialProvider`. Tauri commands validate DTOs and delegate;
they contain no process or protocol state machine.

**Step 3: Register managed state and commands**

Wire install/list/get/enable/disable/uninstall, Connection CRUD/test, Action
listing, and diagnostic summary into `src-tauri/src/lib.rs`.

**Step 4: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugins
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: lifecycle and shutdown tests pass without launching a shell.

## Task 7: Management Workspace, Credential Center, And Plugin Center

**Files:**

- Create: `src/features/management/contracts.ts`
- Create: `src/features/management/store.ts`
- Create: `src/features/management/store.test.ts`
- Create: `src/features/management/components/ManagementWorkspace.vue`
- Create: `src/features/management/components/ManagementNavigation.vue`
- Create: `src/features/credentials/contracts.ts`
- Create: `src/features/credentials/store.ts`
- Create: `src/features/credentials/store.test.ts`
- Create: `src/features/credentials/components/CredentialCenter.vue`
- Create: `src/features/credentials/components/CredentialEditor.vue`
- Create: `src/features/plugins/contracts.ts`
- Create: `src/features/plugins/store.ts`
- Create: `src/features/plugins/store.test.ts`
- Create: `src/features/plugins/components/PluginCenter.vue`
- Create: `src/features/plugins/components/PluginDetail.vue`
- Create: `src/infrastructure/credentials/tauriCredentialClient.ts`
- Create: `src/infrastructure/plugins/tauriPluginClient.ts`
- Modify: `src/app/components/WorkspaceRail.vue`
- Modify: `src/App.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/locales/locales.test.ts`

**Step 1: Write store and component tests first**

Cover list/select/detail, install/configure/test/enable/disable/uninstall,
credential add/replace/remove, typed failures, stale responses, dependency
blocking, keyboard/focus, narrow layout, and no secret projection.

**Step 2: Implement typed adapters and stores**

Stores own async flows and safe projections. Components render and emit intent;
they never call Tauri APIs directly.

**Step 3: Implement UI**

Add one Management rail icon and an internal 220-260 px navigation. Use flat
white/gray surfaces, Manrope/Fraunces/JetBrains Mono already loaded by the app,
compact icon buttons with tooltips, clear empty/loading/error states, and no
structural borders, nested cards, or decorative gradients.

**Step 4: Verify**

Run:

```bash
pnpm test:run -- src/features/management src/features/credentials src/features/plugins src/locales/locales.test.ts
pnpm type-check
```

Then start the app and capture desktop/narrow screenshots with the browser or
Computer Use skill, checking overflow, focus, empty/error states, and that no
credential value appears in DOM text.

## Task 8: Plugin Actions Through ConversationToolBroker

**Files:**

- Create: `src-tauri/src/plugins/action_executor.rs`
- Modify: `src-tauri/src/conversation/tool_broker.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Modify: `src-tauri/src/conversation/commands.rs`
- Modify: `src-tauri/src/conversation/runtime.rs`
- Modify: `src/features/conversation/contracts.ts`
- Modify: `src/infrastructure/conversation/tauriConversationClient.ts`
- Modify: `src/features/conversation/store.ts`
- Modify: relevant conversation tests

**Step 1: Write failing broker routing tests**

Cover namespaced tool definitions, host-selected Connection binding, collision,
disabled dependency, credential exclusion, cancellation, timeout, Plugin crash,
result bounds, and scope closure.

**Step 2: Generalize broker execution ownership**

Replace the assumption that every host tool is emitted to the WebView with one
host-owned executor routing port. Keep the existing Channel executor as an
adapter; route Plugin Action names to `PluginActionExecutor`.

**Step 3: Verify all runtimes**

Run focused Tea, Claude, Codex, broker, and collaboration tests. Confirm no UI
or command branches on runtime name.

## Task 9: Overmind Reference Plugin

**Files:**

- Modify/create in `../tea-connector-overmind/` only after reconciling its dirty
  worktree and current Connector Service changes
- Create: public `plugin.json`
- Create: stdio Plugin protocol adapter
- Reuse: existing Overmind client, normalization, sync, and command logic
- Test: query/detail/status/comment/pagination/error/conformance suites

**Step 1: Preserve provider-domain ownership**

Do not move Overmind API DTOs into Desktop. Replace or complement only the host
adapter with the public local Plugin process protocol.

**Step 2: Pass conformance before Desktop integration**

Run the standalone runner against the built executable, then run one read and
one write Action through Desktop's `ConversationToolBroker`.

**Step 3: Verify**

Run:

```bash
go test ./...
cargo test --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml --test conformance
```

Expected: Overmind domain and Plugin conformance suites pass.

## Task 10: Local Skill Catalog And Skill Center

**Files:**

- Create: `src-tauri/src/skills/mod.rs`
- Create: `src-tauri/src/skills/catalog.rs`
- Create: `src-tauri/src/skills/commands.rs`
- Create: `src/features/skills/contracts.ts`
- Create: `src/features/skills/store.ts`
- Create: `src/features/skills/store.test.ts`
- Create: `src/features/skills/components/SkillCenter.vue`
- Create: `src/features/skills/components/SkillDetail.vue`
- Create: `src/infrastructure/skills/tauriSkillClient.ts`
- Modify: management workspace/navigation and locales
- Extend `tea-rs` first if immutable release selection is not exposed by the
  current `tea-coding::ResourceCatalog` API

**Step 1: Write catalog tests**

Cover immutable ID/version/digest, source/trust, bounded resources, traversal,
enable/disable, update as new release, removal references, corrupt manifest,
and deterministic ordering.

**Step 2: Implement owning SDK capability if needed**

Keep Skill discovery/loading product-neutral in `tea-rs`; Desktop owns install
metadata and UI projection only.

**Step 3: Implement Skill Center and verify**

Run Rust catalog tests, Pinia/component tests, locale parity, type-check, and
desktop/narrow visual checks.

## Task 11: Agent Role Revisions And Resolver

**Files:**

- Create: `src-tauri/src/agent_roles/mod.rs`
- Create: `src-tauri/src/agent_roles/model.rs`
- Create: `src-tauri/src/agent_roles/repository.rs`
- Create: `src-tauri/src/agent_roles/resolver.rs`
- Create: `src-tauri/src/agent_roles/commands.rs`
- Create: `src/features/agent-roles/contracts.ts`
- Create: `src/features/agent-roles/store.ts`
- Create: `src/features/agent-roles/store.test.ts`
- Create: `src/features/agent-roles/components/AgentRoleCenter.vue`
- Create: `src/features/agent-roles/components/AgentRoleEditor.vue`
- Create: `src/features/agent-roles/components/EffectiveConfiguration.vue`
- Create: `src/infrastructure/agent-roles/tauriAgentRoleClient.ts`
- Modify: management workspace/navigation and locales

**Step 1: Write resolver tests**

Cover complete graph and every missing/disabled/incompatible runtime, model,
Skill release, Plugin, Connection, Credential, and Action. Assert deterministic
ordering, immutable revisions, no partial activation, and no copied secret or
artifact content.

**Step 2: Implement revision repository and pure resolver**

Persist references and composition intent only. Resolve effective configuration
from authoritative catalogs before conversation creation.

**Step 3: Implement Role Center**

Provide list/detail, create/duplicate/edit, dependency pickers, effective
configuration preview, typed links to owning centers, save-new-revision, and
safe deletion.

## Task 12: Composer Role Selection And Conversation Binding

**Files:**

- Modify: `src/features/conversation/contracts.ts`
- Modify: `src/features/conversation/store.ts`
- Modify: `src/features/conversation/store.test.ts`
- Modify: `src/features/conversation/components/MessageInput.vue`
- Create: `src/features/conversation/components/RoleSelector.vue`
- Modify: `src-tauri/src/conversation/catalog.rs`
- Modify: `src-tauri/src/conversation/commands.rs`
- Modify: `src-tauri/src/conversation/runtime.rs`
- Modify: `src/App.vue`
- Modify: locales and collaboration tests

**Step 1: Write failing conversation tests**

Cover Role selection before first send, exact revision persistence, resolved
runtime/model/Skill/Plugin Action set, unavailable Role rejection, restoration,
and draft-preserving new-conversation behavior when switching Role.

**Step 2: Separate Role, runtime, and model UI concepts**

Rename the current runtime-as-Agent selection. Add a compact Role selector;
keep runtime/model visible only when not constrained by the Role.

**Step 3: Bind Role immutably**

Create the conversation only after Role resolution succeeds. Store Role and
dependency revisions with catalog metadata. Do not mutate an active
conversation's Role in V1.

**Step 4: Full verification**

Run:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Start the dev app and verify desktop/narrow screenshots for all four centers,
Role editor dependency failures, new-conversation Role selection, and active
conversation Role switching. Confirm no overlap, clipping, blank states, hardcoded
display text, or secret DOM content.

## Completion Criteria

- A third party can implement and validate a Plugin using public artifacts only.
- Desktop can safely install, configure, enable/disable, invoke, upgrade, and
  uninstall the Plugin within the documented trusted-native-code model.
- Credential values exist only in Keychain and the private Plugin protocol.
- Overmind passes the public conformance suite and works through all supported
  conversation runtimes.
- Users manage Credentials, Plugins, Skills, and Agent Roles from one coherent
  Management workspace.
- A Role selected in the composer binds an exact reproducible configuration to
  a conversation, with explicit dependency failures and no silent degradation.

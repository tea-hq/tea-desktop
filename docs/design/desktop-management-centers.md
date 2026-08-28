# Desktop Management Centers

> Status: proposed
> Date: 2026-08-23
> Related roadmap: `docs/plans/2026-08-22-apaas-server-roadmap.md`

## User Problem

Tea Desktop needs one coherent place to manage the building blocks used by an
Agent:

- personal credentials;
- installed third-party Plugins and their Connections;
- installed Skills;
- Agent Roles that compose runtime/model choices, prompts, Skills, and Plugin
  Actions.

Users must also be able to select an Agent Role directly from the conversation
composer when starting work. Management must remain understandable when a
referenced Plugin, Credential, Skill, runtime, model, or Action becomes disabled,
missing, or incompatible.

## Target Invariants

1. Each fact has one owner. Agent Roles store references, not copied Plugin,
   Credential, or Skill state.
2. Credential values never enter Vue state, SQLite, logs, Agent prompts, tool
   arguments, conversation events, or Role documents.
3. A Role is usable only when all required references resolve and are enabled.
   There is no silent partial activation.
4. A conversation records the exact resolved Role revision and dependency
   revisions used to create it.
5. Vue components render projections and emit intent. Tauri application
   services own persistence, Keychain access, Plugin lifecycle, validation, and
   Role resolution.
6. Local facts can later be supplemented by Center-managed facts through source
   adapters without replacing IDs or creating a second UI state machine.

## Information Architecture

Add one `management` entry to the primary `WorkspaceRail`:

```text
Channels
Agent
Management
Settings
```

Management opens a full workspace with a stable internal navigation:

```text
Management
  Credentials
  Plugins
  Skills
  Agent Roles
```

Do not add four primary rail icons. Do not put these domains inside the existing
Settings page. Settings remains the place for application preferences such as
locale, default runtime, and panel behavior.

Desktop layout:

```text
56 px WorkspaceRail
220-260 px management navigation/list
flexing detail/editor surface
optional 360-400 px dependency/diagnostic panel
```

On narrow windows, the list and detail use drill-in navigation. Fixed-width
rows, icon buttons, and status labels must not resize the surrounding layout.

The visual direction is restrained and operational: white content canvas,
gray-50 navigation/detail surfaces, gray-100 compact controls, no structural
borders or decorative cards, semantic green/red only for ready/failure states.
All user-facing copy uses locale keys in both supported locales.

## Domain Model

### Credential

```text
CredentialRecord
  credentialId
  pluginId
  schemaVersion
  displayName
  accountLabel
  source: local | managed
  secretRef
  status: ready | incomplete | unavailable
  lastTestedAt?
  lastTestCode?
  createdAt
  updatedAt
```

`secretRef` is host-only and must not be serialized to the WebView. Frontend
DTOs expose only `hasSecret` and safe status metadata. V1 supports `local` via
Keychain/Credential Manager. `managed` is reserved for a future Center-backed
credential provider and must not be treated as implemented.

Credential schemas are declared by installed Plugins. Removing a Plugin does
not silently delete its Credential records or Keychain entries. The user must
explicitly remove credentials; orphaned records are shown with their Plugin ID
and an unavailable status.

### Plugin And Connection

```text
InstalledPlugin
  pluginId
  version
  manifestDigest
  publisher
  enabled
  processStatus
  Action definitions

PluginConnection
  connectionId
  pluginId
  credentialId
  displayName
  nonSecretConfig
  enabled
  status
```

A Connection is the executable binding between one Plugin and one Credential.
The Agent never chooses `credentialId`; the host resolves the Connection that
the user assigned to the Role or conversation.

### Skill

```text
InstalledSkillRelease
  skillId
  version
  digest
  displayName
  description
  source
  trustLevel
  enabled
  compatibility
  entryResource
  resourceIndex
```

Skill releases are immutable. Updating a Skill installs a new release rather
than rewriting the release referenced by an existing Role or conversation.
Skills provide context only. They cannot enable Plugins, Connections, Actions,
filesystem access, MCP servers, or other tools.

### Agent Role

```text
AgentRoleRevision
  roleId
  revision
  displayName
  description
  runtimeSelector
  modelSelector
  promptSegments
  skillReleaseRefs[]
  pluginBindings[]
  createdAt
  updatedAt

PluginBinding
  connectionId
  allowedActionRefs[]
```

Role revisions contain references and composition intent. They never contain
credentials, Plugin executable paths, copied manifests, copied Skill files, or
runtime session state.

## Management Workflows

### Credential Center

The list shows name, Plugin, account label, source, readiness, and last test.
Primary operations are add, edit, test, replace secret, and remove.

Creating a credential:

1. Select an installed Plugin credential type.
2. Render the Plugin-declared bounded credential form.
3. Send values directly to a Tauri command.
4. Validate and store the secret envelope in Keychain.
5. Persist only safe metadata and return a redacted projection.
6. Optionally run `test_connection` and record only its safe outcome.

Deleting a referenced Credential is blocked by default. The detail view lists
affected Connections and Roles and offers an explicit detach flow. There is no
silent cascade.

### Plugin Center

The list shows installed version, publisher, enabled state, process health,
Connection count, and update/compatibility state. Primary operations are
install, enable/disable, inspect Actions, manage Connections, upgrade, view
diagnostics, and uninstall.

The detail view separates:

- Overview: identity, version, digest, source, compatibility;
- Connections: Credential binding and connection-test status;
- Actions: ID, version, description, read/write effect, schema summary;
- Diagnostics: bounded process failures and protocol status.

Disabling a Plugin terminates its processes, rejects new calls, and marks
dependent Roles unavailable. It does not delete Connections, Credentials, or
Role references. Re-enabling the same compatible Plugin restores them after
validation.

### Skill Center

The list shows name, version, source, trust, enabled state, and dependent Role
count. Primary operations are install/import, inspect instructions/resources,
enable/disable, install update, and remove.

Resource inspection is bounded and read-only through the existing `tea-coding`
Skill resource model. The UI must not interpret Skill content as HTML or execute
instructions during inspection.

Disabling a Skill marks dependent Roles unavailable for new conversations. It
does not mutate existing Role revisions or conversation evidence.

### Agent Role Center

The list shows name, status, runtime/model, Skill count, Plugin count, and last
revision. Primary operations are create, duplicate, edit, validate, save a new
revision, and delete an unreferenced Role.

The editor has compact sections rather than nested cards:

```text
Identity
  name, description

Runtime
  runtime, model

Instructions
  trusted prompt segments

Skills
  enabled immutable Skill releases

Plugin Actions
  Connection -> selected Actions

Effective Configuration
  resolved dependencies, warnings, blocking errors
```

Saving runs host-owned resolution. A Role revision is available only if its
runtime/model is compatible and every required Skill, Plugin, Connection,
Credential, and Action resolves. The UI receives typed dependency errors and
links to the owning center.

## Role Selection In Conversations

The current composer labels runtime choice as Agent choice. These concepts must
be separated:

```text
Role       professional composition chosen by the user
Runtime    Tea, Claude Code, or Codex execution adapter
Model      model selected or constrained by the Role
```

Add a compact Role selector to `MessageInput`. It shows ready Roles first and
unavailable Roles with a concise reason. Selecting a Role previews its runtime,
model, Skills, and Plugin count without displaying credentials.

Recommended V1 lifecycle:

- On an empty/new conversation, selecting a Role sets the Role revision used
  when the first message creates the conversation.
- Once a conversation exists, its Role revision is immutable.
- Choosing another Role offers to start a new conversation with the current
  draft retained locally.
- Channel-bound task creation uses the same Role selection and creates or
  selects a role-bound conversation.

This keeps runtime profile, prompt composition, tools, recovery, and audit
deterministic across Tea, Claude Code, and Codex. Per-turn Role switching is
deferred until all runtime adapters expose a coherent profile-switch contract.

## Dependency Resolution

Role availability is a pure host-owned projection over authoritative records:

```text
Role revision
  -> runtime/model compatible?
  -> every Skill release installed and enabled?
  -> every Plugin installed, compatible, and enabled?
  -> every Connection enabled and healthy enough to invoke?
  -> every Credential available?
  -> every referenced Action/version still declared?
  -> Ready or typed unavailable reasons
```

Connection health may become stale and should be shown separately from hard
configuration validity. A transient failed connection test does not rewrite the
Role; invocation may still fail with a typed Plugin error.

Deleting, disabling, upgrading, or replacing dependencies recomputes the
projection. It never rewrites Role references automatically. Plugin upgrades
that remove or incompatibly change Actions leave affected Roles unavailable
until explicitly edited.

## Ownership And Modules

```text
src/features/management/              workspace navigation/composition only
src/features/credentials/             store, contracts, components
src/features/plugins/                 store, contracts, components
src/features/skills/                  store, contracts, components
src/features/agent-roles/             store, resolver projection, components
src/infrastructure/<domain>/           typed Tauri adapters

src-tauri/src/plugins/                 package/process/Connection/Action owner
src-tauri/src/credentials/             credential metadata and provider port
src-tauri/src/skills/                  local Skill catalog adapter
src-tauri/src/agent_roles/             revisions and dependency resolution
```

Create directories only when implementation introduces real code. Cross-domain
coordination belongs in a management or Role application service, not in one
Pinia store calling another.

## Failure And Recovery

- Keychain unavailable: Credential remains listed as unavailable; no secret is
  copied into fallback storage.
- Plugin crash: process status changes, pending calls fail, dependent Roles
  remain configured but invocation is unavailable until recovery.
- Plugin upgrade incompatibility: retain the prior runnable generation when
  possible and report the blocked upgrade.
- Skill missing or disabled: Role is unavailable for new conversations; existing
  conversation evidence remains readable.
- Role revision missing dependency: conversation creation fails before runtime
  creation with typed references to the owning center.
- Application restart: restore metadata and recompute all dependency health;
  never persist a second cached truth as authoritative.
- Center unavailable in a later hybrid phase: local-source records remain
  usable; managed-source expiry follows its own fail-closed contract.

## Testing

- Credential store: redaction, schema validation, Keychain failure, replace,
  referenced deletion, orphan recovery.
- Plugin store/host: install, enable/disable, Connection binding, crash,
  protocol mismatch, Action changes, uninstall dependencies.
- Skill catalog: immutable releases, digest mismatch, bounded inspection,
  enable/disable, referenced removal.
- Role resolver: complete graph, every missing/disabled dependency, duplicate
  refs, version incompatibility, deterministic ordering, no partial activation.
- Management stores: fake clients, loading/error/retry, stale response
  suppression, navigation preservation.
- Components: list/detail selection, forms, dependency links, disabled states,
  keyboard/focus behavior, narrow viewport layout, locale parity.
- Conversation flow: Role selection before first send, immutable binding,
  draft-preserving new-conversation switch, restore by exact revision.

## Product Decision To Confirm

V1 assumes a Role is immutable for one conversation. The Role selector is in
the message composer for quick access, but switching it in an active
conversation starts a new conversation. Supporting a different Role for every
message would require a new cross-runtime per-turn profile contract and is not
implemented by prompt concatenation.

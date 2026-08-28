# Electron ACP Runtime Implementation Plan

> **For implementers:** REQUIRED SUB-SKILL: Use the repository's implementation
> workflow to implement this plan task-by-task and keep each task reviewable.
> This plan is the implementation of ADR 0022.

**Goal:** Replace the vendor-specific external conversation runtimes with an
Electron main-process runtime using the official TypeScript ACP SDK and the
official Claude/Codex ACP Agents, while preserving the complete current Tea
conversation behavior.

**Architecture:** The Vue renderer talks to a typed Electron preload API. The
Electron main process owns `ConversationHost`, the ACP Client, Agent process
records, standard MCP HostTools, catalog bindings, and recovery. ACP is the
only external Agent wire protocol; Claude and Codex are data-driven official
ACP Agent definitions. The built-in Tea runtime remains a separate runtime
boundary and is not converted into ACP by this plan.

**Tech Stack:** Electron 44, Electron Builder, Vue 3, TypeScript, Pinia,
Vitest, Playwright, `@agentclientprotocol/sdk` 1.4.0, the official
`@agentclientprotocol/claude-agent-acp` 0.70.0,
`@agentclientprotocol/codex-acp` 1.7.0, `@modelcontextprotocol/sdk` 1.30.0,
Node child-process APIs, and the existing frontend domain contracts.

---

## Target Invariants

The implementation is complete only when all of these are true:

- External agents communicate with Tea only through official ACP messages.
- Electron main uses the official TypeScript ACP Client and
  `ndJsonStream`; it does not hand-write a second JSON-RPC dispatcher.
- Claude and Codex use pinned official ACP Agent artifacts, not copied vendor
  implementations and not runtime `npx` resolution.
- New connections prefer official ACP V2 and use V1 when that is the highest
  mutually supported version. One connection uses one version.
- Tea never translates V1 messages into V2 messages or the reverse. A V2/V1
  choice that requires a retry uses a fresh Agent connection.
- The negotiated wire version, Agent artifact identity, and ACP session id are
  persisted in the conversation binding. Restore requires the recorded
  binding and never silently changes Agent or protocol version.
- `session/load` restores and replays complete conversation history before a
  restored snapshot is exposed. `session/resume` is valid exact-session
  continuation, but does not expose Snapshot or History without a complete
  projection. Local transcript fallback is not a substitute for Agent state.
- Streaming, tool progress, permissions, cancellation, modes, model
  selection, channel history, Plugin actions, snapshots, history pages,
  subject generation, multiple turns, and restart recovery remain supported.
- HostTools use standard MCP command-based stdio configuration in ACP session
  setup. No private ACP method, HTTP bridge, or Tea JSON-RPC envelope exists.
- The renderer never starts an Agent process, reads credentials, parses ACP,
  or owns durable conversation facts.
- Child process input, diagnostics, environment, shutdown, and recovery are
  bounded and deterministic. Tests use explicit signals and fake clocks.

## Task 1: Establish The Electron Host Boundary

**Files:**

- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/ipc/index.ts`
- Create: `electron/ipc/conversation.ts`
- Create: `electron/ipc/events.ts`
- Create: `electron/infrastructure/errors.ts`
- Create: `electron/infrastructure/app-paths.ts`
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Modify: `src/main.ts`
- Create: `src/infrastructure/electronBridge.ts`

### Step 1: Add the Electron entrypoints

Create a single Electron main entrypoint that creates the browser window,
loads the Vite renderer in development, loads the packaged renderer in
production, and installs the preload bridge. Keep the main entrypoint limited
to composition; conversation behavior belongs under `electron/conversation`.

Create a context-isolated preload API. Expose typed methods and event
subscriptions only; do not expose `ipcRenderer`, `child_process`, filesystem
access, or an arbitrary channel name to the renderer.

### Step 2: Add the package scripts and builder configuration

Add development, type-check, test, package, and platform build scripts. Keep
the renderer's existing Vite build and configure Electron Builder to package
the main process, preload script, renderer assets, managed ACP artifacts, and
license notices.

The packaged app must not depend on a user-installed Node, npm, pnpm, or
network access to launch an Agent. Electron main may use its embedded Node
runtime for the ACP Client; child Agent launch uses the exact managed runtime
and entrypoint recorded by the Agent definition.

### Step 3: Verify the host boundary

Add a smoke test that starts Electron with a test renderer and proves that an
unrecognized IPC channel is unavailable, the preload API is available, and
the main process exits cleanly. Run:

```bash
pnpm type-check
pnpm test:run -- electron
```

Expected: the renderer and preload types compile and the host boundary tests
pass without launching a real Agent.

## Task 2: Define The TypeScript ACP Dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `electron/conversation/acp/dependency-versions.ts`
- Create: `docs/extensions/acp-agent-artifacts.md`

### Step 1: Pin the official packages

Add exact versions for:

```text
@agentclientprotocol/sdk@1.4.0
@agentclientprotocol/claude-agent-acp@0.70.0
@agentclientprotocol/codex-acp@1.7.0
@modelcontextprotocol/sdk@1.30.0
```

Use the package lockfile as the complete dependency closure. Record the
resolved versions and SHA-512 integrity values in the artifact manifest
generated during packaging. Do not use caret ranges for managed Agent
artifacts.

### Step 2: Document the role split

Record that:

- `@agentclientprotocol/sdk` is the Electron ACP Client SDK;
- `claude-agent-acp` and `codex-acp` are ACP Agent processes;
- `claude-agent-acp` uses Claude Agent SDK semantics;
- `codex-acp` starts and maps Codex App Server;
- `npx` is not part of the runtime;
- Electron main is the only product process allowed to compose these pieces.

### Step 3: Verify SDK entrypoints

Compile a small type-only fixture against the stable V1 import and the
experimental V2 import:

```ts
import * as acp from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'
```

The fixture must type-check `client`, `ndJsonStream`, session helpers,
permission callbacks, filesystem callbacks, terminal callbacks, and the V2
wire types. Run:

```bash
pnpm type-check
pnpm exec vitest run electron/conversation/acp
```

## Task 3: Define The Agent Catalog And Managed Artifacts

**Files:**

- Create: `electron/conversation/acp/agent-definition.ts`
- Create: `electron/conversation/acp/agent-catalog.ts`
- Create: `electron/conversation/acp/artifact-manifest.ts`
- Create: `electron/conversation/acp/artifact-resolver.ts`
- Create: `scripts/build-acp-agents.mjs`
- Create: `scripts/check-acp-agents.mjs`
- Create: `managed-agents/claude/manifest.json`
- Create: `managed-agents/codex/manifest.json`
- Create: `managed-agents/licenses/README.md`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `electron-builder.yml`

### Step 1: Define typed Agent data

Define `AgentDefinition` with:

- stable runtime id and display name;
- Agent kind and official adapter package identity;
- exact executable and entrypoint;
- literal argument list;
- workspace and session setup rules;
- shared-connection or per-conversation process scope;
- required ACP capabilities;
- mode and model mapping metadata;
- artifact version, target, digest, and license metadata.

The renderer cannot provide an executable, argument vector, environment key,
or artifact path. Agent definitions are compiled or host-configured data
validated in Electron main.

### Step 2: Build deterministic Agent artifacts

The build script installs from the committed lockfile, verifies the expected
package names and versions, copies the official adapter entrypoints and
dependency closure into a target-specific artifact directory, and writes a
manifest containing the digest of every launchable file.

The runtime resolver accepts only an artifact manifest generated by this
script. It rejects missing files, target mismatch, digest mismatch, and
unexpected package identity before starting ACP.

Register `acp-agents:build` and `check:acp-agents` in `package.json`; both
commands must operate from the committed lockfile and must not install or
resolve packages during application startup.

Do not copy the official adapter source into Tea. The artifact is an external
ACP Agent implementation consumed through its public protocol.

### Step 3: Test artifact resolution

Use synthetic manifests and temporary directories to test target selection,
digest mismatch, missing entrypoint, lockfile mismatch, and offline startup.
No test may call a package manager or the network. Run:

```bash
pnpm exec vitest run electron/conversation/acp/artifact-resolver.test.ts
pnpm check:acp-agents
```

## Task 4: Implement The Electron ACP Connection Layer

**Files:**

- Create: `electron/conversation/acp/process.ts`
- Create: `electron/conversation/acp/stream.ts`
- Create: `electron/conversation/acp/client.ts`
- Create: `electron/conversation/acp/version-selection.ts`
- Create: `electron/conversation/acp/connection.ts`
- Create: `electron/conversation/acp/errors.ts`

### Step 1: Start a typed Agent process

Start only a resolved executable with `child_process.spawn` and an argument
array. Configure piped stdin/stdout/stderr, the selected workspace, an
explicit environment, and hidden windows on Windows. Never interpolate a
shell command.

Keep the process record separate from the ACP connection record. It must
contain generation, PID, exit state, bounded stderr tail, and a close signal.
The process wrapper must terminate the child and descendants according to the
platform policy when the connection closes.

### Step 2: Connect through the official SDK

Convert Node child streams with `Readable.toWeb` and `Writable.toWeb`, then
construct the official stream:

```ts
const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))
```

Use `client({ name, version })` and register typed handlers for
`session/update`, `session/request_permission`, filesystem, terminal, and
elicitation callbacks. All ACP request/notification correlation remains in
the official SDK.

### Step 3: Apply the V2/V1 rule

Use the experimental V2 Client entrypoint for the first attempt and the stable
V1 Client entrypoint for an explicit fresh-connection retry when the Agent
does not accept V2. The version selector records the selected version only
after successful initialization.

The selector may inspect the typed initialization result and recreate the
Agent process. It must not modify later messages, normalize vendor payloads,
or keep two protocol versions active on one connection. If neither version
is compatible, return a typed `unsupportedProtocolVersion` failure.

Add tests for V2-only, V1-only, both-version, no-compatible-version, malformed
initialize response, and retry-after-V2-rejection. Use in-memory Web Streams
and a deterministic fake Agent.

### Step 4: Bound the host transport

The official TypeScript SDK's `ndJsonStream` is the protocol codec. Wrap the
Node streams at the Electron host boundary to enforce maximum input line
bytes, diagnostics bytes, concurrent writes, and shutdown deadlines. The
wrapper must preserve complete valid ACP messages and reject oversized or
unterminated input deterministically.

This is transport policy, not a new ACP message format. Test partial chunks,
multiple messages per chunk, oversized messages, malformed JSON, stdout EOF,
stderr overflow, child exit during a request, and shutdown while a write is
pending.

## Task 5: Implement The ACP Conversation Runtime

**Files:**

- Create: `electron/conversation/acp/runtime.ts`
- Create: `electron/conversation/acp/session.ts`
- Create: `electron/conversation/acp/projector.ts`
- Create: `electron/conversation/acp/operation.ts`
- Create: `electron/conversation/runtime.ts`
- Modify: `src/features/conversation/contracts.ts` only for confirmed DTO changes
- Create: `electron/conversation/acp/runtime.test.ts`
- Create: `electron/conversation/acp/projector.test.ts`

### Step 1: Define the main-process runtime port

Move the product-level `ConversationRuntime` contract into TypeScript main
code without exposing ACP types to the renderer. Preserve typed descriptors,
conversation handles, event sequences, terminal states, failures, approvals,
snapshots, history pages, and cancellation.

The renderer-facing DTOs remain stable product types. ACP schema types are
used only by the ACP client, session actor, and projector.

### Step 2: Map the session lifecycle

Implement:

| Product operation    | ACP operation                                  |
| -------------------- | ---------------------------------------------- |
| create conversation  | `initialize` then `session/new`                |
| restore conversation | `initialize` then exact load or resume         |
| send turn            | `session/prompt`                               |
| stream output        | `session/update`                               |
| cancel turn          | `session/cancel`                               |
| change mode          | `session/set_mode`                             |
| change configuration | advertised ACP session configuration           |
| close session        | official session close and connection shutdown |

Register session handlers before `session/new`, `session/load`, or
`session/resume`. Reject
updates for an unknown session, wrong conversation, stale turn, duplicate
terminal transition, or invalid tool lifecycle.

### Step 3: Project ACP events

`AcpEventProjector` maps typed ACP updates to Tea events. It assigns the Tea
sequence only after validating session and turn ownership. It must handle
text, thoughts, tool calls, tool progress, plans, terminal content, images,
file changes, and stop reasons according to the existing product contract.

Transport failure, Agent failure, cancellation, and invalid protocol state
must each produce one terminal product outcome. Pending approvals and
operations are completed exactly once.

### Step 4: Implement full-load snapshots

For `session/load`, install the collector first, collect the complete replay,
wait for the typed load response, build a fresh snapshot, and then release
live updates that arrived during replay in order. `session/resume` may restore
the same Agent-owned session without prior messages; that actor can continue
future turns but must not advertise or expose complete Snapshot or History.

Test multiple turns, concurrent sessions where supported, load replay,
load-time updates, cancellation, Agent exit, duplicate updates, wrong
session ids, and event sequence restart after recovery.

## Task 6: Expose HostTools Through Standard MCP

**Files:**

- Create: `electron/conversation/acp/mcp-server.ts`
- Create: `electron/conversation/acp/mcp-process.ts`
- Create: `electron/conversation/tool-broker.ts`
- Modify: `electron/conversation/acp/session.ts`
- Create: `electron/conversation/acp/mcp.test.ts`

### Step 1: Implement the MCP server

Use the official MCP TypeScript SDK to expose the selected
`HostToolDefinition` values. The MCP server must be command-based stdio so it
can be described in ACP `session/new` and `session/load` using the standard
MCP configuration shape.

The server receives `tools/call`, validates the conversation scope, and calls
the Electron main `ConversationToolBroker`. It never receives credentials
from the renderer or Agent.

### Step 2: Preserve broker ownership

Keep the broker responsible for:

- conversation tool scope and selected definitions;
- argument and result size/depth bounds;
- timeout, cancellation, and duplicate resolution;
- frontend host-tool notifications;
- Plugin action credential resolution;
- channel history lookup.

MCP output uses structured content where supported and standard text content
as a fallback. The explicit `mcpServerIds: []` selection means no tools.

### Step 3: Attach selection during session setup

Resolve the driving turn's MCP selection before `session/new` or
`session/load`. Do not reread transcript history to reconstruct it. A change
to the selection is a typed session configuration change and cannot silently
mutate an active session when ACP does not provide that lifecycle operation.

Test discovery, empty selection, channel history, Plugin action, malformed
arguments, oversized output, timeout, cancellation, duplicate calls,
wrong-session calls, and restore-time tool calls.

## Task 7: Implement Permissions, Filesystem, Terminal, And Elicitation

**Files:**

- Create: `electron/conversation/acp/client-services.ts`
- Create: `electron/conversation/acp/permissions.ts`
- Create: `electron/conversation/acp/terminal.ts`
- Create: `electron/conversation/acp/paths.ts`
- Modify: `electron/conversation/acp/client.ts`
- Modify: `electron/conversation/acp/projector.ts`
- Modify: `src/features/conversation/contracts.ts` only for confirmed option changes
- Create: `electron/conversation/acp/client-services.test.ts`

### Step 1: Map permission requests exactly

For every ACP permission request, validate session, tool call, title,
resource, and offered options. Store the ACP request id and option ids in a
pending approval record. Accept one decision exactly once and send the typed
ACP response using the offered option id.

Preserve `AllowOnce`, `AllowSession`, `Deny`, and `Cancel` only when the Agent
offers matching semantics. Do not collapse an unrepresentable session-level
decision into a different decision.

### Step 2: Implement filesystem and terminal callbacks

Advertise only capabilities that Electron main can enforce. Validate workspace
roots and path traversal before filesystem access. Maintain terminal handles
by session and conversation, bound output, support wait/kill/release, and
release all handles on cancellation, session close, process exit, and app
shutdown.

### Step 3: Map modes and models

Read available configuration from ACP initialization/session responses. Map
Tea's `readOnly`, `default`, and `fullAccess` to explicit Agent definition
ids. Expose only advertised model ids and reasoning/configuration options.
Unsupported values return typed errors.

Test permission timeout/cancel/shutdown, wrong-session requests, path
traversal, terminal output bounds, terminal cancellation, mode mapping, model
selection, elicitation, and resource cleanup.

## Task 8: Move Catalog And Recovery To Electron Main

**Files:**

- Create: `electron/storage/database.ts`
- Create: `electron/storage/migrations.ts`
- Create: `electron/conversation/catalog.ts`
- Create: `electron/conversation/catalog.test.ts`
- Modify: `electron/conversation/runtime.ts`
- Modify: `electron/ipc/conversation.ts`
- Create: `docs/testing/electron-conversation-catalog.md`
- Update: `docs/testing/conversation-catalog.md`

### Step 1: Preserve the catalog contract

Port the initial conversation catalog schema and idempotency behavior to an
Electron-main SQLite owner. Use an Electron-compatible SQLite driver and
keep all database access in main. Do not put durable conversation state in
the renderer or an ACP transcript cache.

The initial schema may be replaced directly under the repository's pre-1.0
policy. Store opaque ACP session id, Agent definition revision, wire version,
artifact identity/digest, workspace binding, MCP selection, mode, and model.
Never store credentials, full environment values, transcripts, or unbounded
stderr.

### Step 2: Create atomically

Resolve Agent definition and MCP scope before calling `session/new`. Persist
the returned ACP session id and binding atomically. If persistence fails,
close the just-created session and Agent connection; do not leave an
untracked live session.

### Step 3: Restore exactly

Resolve the recorded Agent artifact and wire version, start the connection,
attach the recorded MCP selection, register the update collector, and call
`session/load`. Reject artifact mismatch, version mismatch, missing session,
incomplete replay, unsupported configuration, and invalid update state.

The sidebar remains catalog-owned. The Agent remains authoritative for
conversation facts. Channel turn context, drafts, delivery state, and other
Desktop metadata stay outside ACP transcript messages.

### Step 4: Test recovery

Cover cold restart, missing artifact, digest change, unavailable session,
changed Agent definition, changed MCP selection, changed mode/model,
load-time live updates, catalog idempotency, and channel-bound history.

## Task 9: Move Subject Generation And Collaboration Context

**Files:**

- Create: `electron/conversation/subject.ts`
- Create: `electron/conversation/collaboration.ts`
- Modify: `electron/conversation/acp/runtime.ts`
- Modify: `electron/conversation/acp/mcp-server.ts`
- Create: `electron/conversation/subject.test.ts`

### Step 1: Generate subjects through ACP

Create a disposable ACP session with no HostTools, send the existing subject
prompt through `session/prompt`, collect assistant text until terminal
completion, normalize with the existing subject rules, and close the session.

The subject session cannot mutate the target conversation's session,
snapshot, MCP selection, mode, model, or catalog binding.

### Step 2: Preserve channel context

Keep channel source references and per-turn context in the Electron catalog.
Use the existing bounded channel history operation through the MCP broker.
Do not put source identity or delivery state into ACP extension fields.

Test empty input, malformed output, timeout/cancel, Agent failure, duplicate
generation, session cleanup, and channel-bound multi-turn history.

## Task 10: Wire Typed Electron IPC And Vue

**Files:**

- Modify: `electron/ipc/conversation.ts`
- Modify: `electron/ipc/events.ts`
- Modify: `electron/preload.ts`
- Create: `src/infrastructure/conversation/electronConversationClient.ts`
- Modify: `src/features/conversation/store.ts` only for confirmed IPC changes
- Modify: `src/features/conversation/contracts.ts` only for confirmed DTO changes
- Modify: `src/main.ts`
- Create: `src/infrastructure/conversation/electronConversationClient.test.ts`

### Step 1: Keep commands thin

Electron IPC handlers validate typed requests, delegate to
`ConversationHost`, and map typed errors. They do not parse ACP, launch
arbitrary commands, execute tools, or mutate frontend state.

Expose event subscriptions with a typed allowlist. Remove renderer access to
Tauri `invoke/listen` from the conversation path.

### Step 2: Keep the frontend protocol-neutral

The existing Vue store and components continue to consume descriptors,
conversation events, snapshot/history DTOs, approvals, and HostTool events.
No Vue module imports ACP schema types or branches on Claude/Codex names.

Test IPC serialization, event ordering, typed errors, subscription disposal,
store success/failure/cancel/recovery, and renderer behavior with a fake
`ConversationClient`.

## Task 11: Register The Final Runtime And Migrate The Shell

Implementation status on 2026-08-29: the Electron main cutover, atomic Agent
artifact gate, session model/mode mapping, and package unpack configuration are
implemented. Target-specific packaged process smoke tests remain a release
check and have not been run as part of normal validation.

**Files:**

- Create: `electron/conversation/registry.ts`
- Create: `electron/conversation/host.ts`
- Modify: `electron/main.ts`
- Modify: `electron/ipc/conversationCommands.ts`
- Modify: `electron-builder.json5`
- Modify: `package.json`
- Update: `docs/adr/0002-codex-app-server-runtime.md`
- Update: `docs/adr/0005-conversation-catalog-and-runtime-recovery.md`

### Step 1: Compose runtime definitions

Register atomically:

```text
external.claude  -> generic AcpConversationRuntime + official Claude Agent
external.codex   -> generic AcpConversationRuntime + official Codex Agent
```

There is one generic external runtime implementation and two data-driven
Agent definitions. Do not expose `external.claude-acp` or
`external.codex-acp` as duplicate product runtime ids.

No built-in Tea Electron runtime exists in this repository. Task 11 does not
invent one or route it through ACP. The registry is published only after both
pinned official Agent entry points verify; one failure prevents a partial ready
registry.

### Step 2: Migrate conversation ownership

Switch the conversation registry and IPC composition to Electron main in one
runtime-boundary change. Existing Tauri Claude and Codex implementations are
not kept as production fallbacks after the ACP runtime satisfies the complete
matrix.

A future built-in Tea runtime must remain behind its own explicit runtime port.
Its transport must be separately typed and must not be mixed into ACP.

In this Electron target that port is not implemented, so only the two external
ACP runtimes are currently registered.

### Step 3: Apply advertised session configuration

Read model and mode choices from `session/new`, `session/load`, or
`session/resume`. Apply changes before `session/prompt` and reject unadvertised
values. Claude maps product permission modes to `plan`, `default`, and
`bypassPermissions`; Codex maps them to `read-only`, `agent`, and
`agent-full-access`. Do not infer static renderer model lists from runtime ids.

### Step 4: Package the Agent process closure

Electron Builder includes production dependencies and unpacks the official ACP
adapter entry points, Claude Agent SDK and platform binary packages, and Codex
launcher and platform packages. Packaged launch uses Electron as Node and must
not require system Node or a runtime package manager.

The renderer sends only HostTool `{name, version}` references across preload.
Electron main rejects schema-bearing values and resolves canonical definitions
for new creation, idempotent activation, and cold restore.

### Step 5: Mark superseded decisions

Update the Codex-specific and Tauri-specific conversation ADRs to point to
ADR 0022 and mark their external-runtime decisions superseded. Do not copy
the old vendor state machines into Electron.

## Task 12: Remove Obsolete External Implementations

**Files:**

- Delete after the compatibility gate: `electron/services/conversation.ts`
- Delete after equivalent ACP coverage is confirmed:
  `electron/services/conversation.test.ts`
- Remove only imports, fixtures, and helpers made unused by those deletions

Remove only code made unused by the Electron conversation migration. Do not
leave a hidden Claude stream parser, Codex App Server client, private MCP
bridge, or duplicate external runtime behind an unused adapter. The production
entry already has no reference to this service; deletion is a separate review
step so historical tests are not removed before equivalent ACP coverage is
confirmed.

Before deletion, confirm that each old behavior has an ACP test and a
corresponding row in `docs/testing/acp-runtime-compatibility.md`.

## Task 13: Complete Compatibility And Security Verification

**Files:**

- Create: `docs/testing/acp-runtime-compatibility.md`
- Create: `docs/testing/electron-acp-processes.md`
- Update: `docs/adr/0022-official-acp-electron-runtime.md`
- Update: `AGENTS.md` only if the accepted host invariant changes

### ACP matrix

Run against deterministic fake Agents first and the pinned official Agent
artifacts second:

- V2-only, V1-only, both-version, and no-compatible-version initialization;
- protocol selection persistence and version mismatch on restore;
- malformed, oversized, deeply nested, duplicate, and wrong-session messages;
- complete session load replay and load-time live-update buffering;
- three turns in one session and multiple sessions on one connection;
- text, thought, tool, plan, terminal, image, file-change, and stop updates;
- permission option identity, allow once/session, deny, cancel, timeout, and
  connection exit;
- mode and model discovery, mapping, unsupported values, and changes;
- MCP empty selection, channel history, Plugin action, bounds, timeout,
  cancellation, and credential containment;
- filesystem path policy and terminal create/output/wait/kill/release;
- subject session isolation and cleanup;
- Agent crash, stdout EOF, stderr overflow, shutdown, and descendant cleanup;
- catalog binding, idempotency, cold restore, missing session, and changed
  artifact;
- renderer IPC serialization, event ordering, store recovery, and disposal.

### Electron packaging matrix

Verify that packaged builds:

- start the pinned Agent without `npx`, npm, pnpm, or network access;
- honor the clean lockfile closure and reject a missing or changed adapter
  package identity/entry point;
- do not require system Node when the managed runtime is bundled;
- do not leak credentials through environment, argv, catalog, logs, stderr,
  snapshots, or MCP arguments;
- close MCP servers, ACP connections, and Agent descendants on application
  shutdown;
- use the correct target-specific artifact and license inventory.

### Commands

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web

# Explicit release check only:
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build
```

Expected: all focused unit tests, frontend tests, Electron host tests, and
packaged startup checks pass. Live Claude/Codex tests are opt-in, use the
pinned artifacts, and never store captured user transcripts in the repo.

## Completion Criteria

The plan is complete when:

- Electron main is the ACP Client host;
- `@agentclientprotocol/sdk` is the only ACP Client implementation;
- Claude and Codex use pinned official ACP Agent artifacts;
- no runtime path invokes `npx`, `@latest`, or a package manager;
- V2-preferred/V1-compatible selection is implemented without translation;
- the complete session, update, permission, MCP, terminal, model/mode,
  subject, snapshot, history, and recovery matrix passes;
- the renderer remains ACP-neutral;
- the obsolete Electron vendor-specific service and private bridges are removed
  after the gate;
- ADR 0022, the compatibility matrix, artifact policy, and repository guide
  describe the same Electron architecture.

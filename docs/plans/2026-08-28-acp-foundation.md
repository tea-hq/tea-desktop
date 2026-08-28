# ACP Foundation Implementation Plan

> **For Codex:** Execute with the repository's implementation workflow. Do not
> commit until the user explicitly requests it.

**Goal:** Establish the Electron main-process ACP foundation using official,
pinned SDKs and a renderer-neutral runtime boundary without claiming incomplete
session, MCP, or recovery support.

**Architecture:** `ElectronConversationService` remains the catalog/application
service while runtime execution moves behind `ConversationRuntimeRegistry`.
The first slice adds stable runtime contracts, official Agent definitions,
bounded child-process ownership, and an injectable ACP connection factory. A
later slice implements `AcpConversationRuntime` session actors, event projection,
MCP HostTools, and exact restore.

**Tech Stack:** Electron 44, TypeScript 6, Vitest,
`@agentclientprotocol/sdk@1.4.0`, official Claude/Codex ACP Agent packages, and
`@modelcontextprotocol/sdk@1.30.0`.

---

## Problem And Invariants

The current service embeds Claude stream parsing and Codex App Server JSON-RPC.
Adding ACP inside the same service would create a third runtime state machine.
Electron main must instead own one registry and expose only product DTOs to IPC.

- ACP types do not cross preload or renderer boundaries.
- Agent executables and arguments are explicit; no shell or runtime `npx`.
- Definitions contain no credentials and environment values are allowlisted.
- Process and connection shutdown are idempotent and bounded.
- Registry ids are unique and descriptors are deterministic.
- Incomplete ACP runtimes are not advertised as ready product runtimes.
- Connection failures close the child and reject initialization with a stable
  main-process error category.
- Recovery cannot silently create a replacement session; the next runtime
  slice must use exact `session/load` or `session/resume` on the recorded wire.

### Task 1: Migrate Reusable Documentation

**Files:** `docs/README.md`, `docs/adr/**`, `docs/design/**`,
`docs/extensions/**`, `docs/testing/**`

1. Import framework-neutral product decisions and contracts.
2. Exclude UI-system documents that conflict with `DESIGN.md`.
3. Mark vendor-specific runtime decisions as superseded by ACP.
4. Record how predecessor implementation paths should be interpreted.

**Verify:** scan active authority documents for contradictory runtime or UI
instructions and validate the Plugin JSON schema.

### Task 2: Pin Official Dependencies And Artifact Identities

**Files:** `package.json`, `package-lock.json`,
`electron/conversation/acp/dependencyVersions.ts`,
`docs/extensions/acp-agent-artifacts.md`

1. Add exact ACP Agent, ACP SDK, and MCP SDK versions.
2. Record package roles and published integrity values.
3. Add a type-level SDK entrypoint test for stable V1 and experimental V2.

**Verify:** `npm run type-check` and focused ACP tests.

### Task 3: Define Runtime Ownership

**Files:** `electron/conversation/runtime.ts`,
`electron/conversation/runtimeRegistry.ts`, focused tests

1. Define the renderer-neutral runtime lifecycle and stable typed errors.
2. Reject duplicate ids and lookups after shutdown.
3. Shut runtimes down once in deterministic registry order.

**Verify:** tests cover duplicate registration, unknown runtime, and idempotent
shutdown.

### Task 4: Build The ACP Host Foundation

**Files:** `electron/conversation/acp/agentDefinition.ts`,
`agentCatalog.ts`, `process.ts`, `connection.ts`, and focused tests

1. Define pinned Claude and Codex Agent records with explicit entrypoints.
2. Resolve only package-owned entrypoints and validate expected package roots.
3. Spawn without a shell, with bounded diagnostics and an allowlisted
   environment.
4. Wire stdout/stdin through the official SDK `ndJsonStream` and initialize an
   injected ACP Client.
5. Close connections and child processes deterministically on initialization
   failure and application shutdown.

**Verify:** tests use fake process handles/clients and deterministic completion
signals; no real Agent or network is used.

### Task 5: Integrate Without False Capability Claims

**Files:** `electron/services/conversation.ts`, `electron/main.ts`, tests

1. Compose the registry in Electron main and inject it into the conversation
   service.
2. Keep the legacy external paths operational until the ACP runtime implements
   the full compatibility matrix.
3. Do not expose an ACP runtime descriptor as `ready` in this foundation slice.

**Verify:** the existing conversation suite remains green and shutdown closes
the registry.

## Next Slice

Implement `AcpConversationRuntime` with `session/new`, `session/prompt`,
`session/update`, permission correlation, cancellation, and full-load event
projection. Then add standard MCP HostTools and exact catalog restore before
replacing `external.claude` and `external.codex` in the registry.

## Runtime Slice Checkpoint

The first runtime slice is implemented without changing the production runtime
selection:

- V1 and V2 client callbacks are registered before the official SDK connection
  starts;
- the session actor owns `session/new`, prompt operation identity, ordered
  updates, cancellation, connection failure, and exactly one terminal outcome;
- the projector consumes typed V1 and V2 updates independently and projects the
  text/tool subset supported by the current Tea event contract;
- permission requests retain the ACP request identity and exact offered option
  ids, and unrepresentable or ambiguous decisions are rejected;
- `AcpConversationRuntime` implements create, prompt, subscribe, cancel,
  approval response, and shutdown while remaining `unavailable` and unregistered.

Snapshot and history now exist for complete new-session or V1 load projections;
V1/V2 resume-only actors correctly keep them unsupported. Exact load/resume and
HostTool reattachment are implemented internally. Filesystem, terminal,
elicitation, modes, models, collaboration sources, subject generation, durable
catalog binding, and the remaining content projections are still explicit
unsupported paths. All ACP capabilities remain unadvertised while the runtime
is unavailable. The legacy Claude and Codex runtimes remain authoritative until
the compatibility matrix is complete.

## MCP Broker Checkpoint

The Electron main `ConversationToolBroker` and an official MCP server adapter
are implemented as an inactive boundary:

- configured tool definitions are validated and bound to immutable
  conversation-scope revisions;
- arguments and results are bounded by JSON depth and encoded size and checked
  against the selected JSON Schemas;
- pending calls have deterministic concurrency, timeout, cancellation,
  duplicate-resolution, wrong-conversation, reconfiguration, and shutdown
  behavior;
- the official MCP SDK owns initialization and the standard `tools/list` and
  `tools/call` wire messages;
- successful calls return both structured content and standard text fallback,
  while an explicit empty selection discovers no tools.

## Authenticated MCP Attachment Checkpoint

ADR 0024 accepts and the ACP runtime implements the bounded local process
boundary required by command-based MCP stdio:

- Electron main creates a private one-session socket or named pipe and owns the
  official MCP server over `ConversationToolBroker`;
- a separately built Electron-as-Node relay consumes a private one-time
  credential, authenticates, and then relays bytes without parsing MCP;
- non-empty immutable tool scopes produce one exact V1/V2 MCP configuration in
  `session/new`, `session/load`, or `session/resume`; explicit empty scopes
  produce none;
- session creation waits for both ACP `session/new` and MCP attachment
  readiness, and all failure and shutdown paths close resources idempotently;
- HostTool reconfiguration is rejected once conversation creation starts, and
  ordinary turn cancellation retains the attachment for later turns.

The runtime remains `unavailable` and unregistered. Durable catalog binding,
complete history availability for resume-only sessions, packaged artifact
validation, and the remaining compatibility matrix still gate production
activation.

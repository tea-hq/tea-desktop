# ACP Exact Session Recovery Implementation Plan

> **For implementers:** Use the repository implementation workflow and execute
> this plan task-by-task. Do not commit without explicit user approval.

**Goal:** Restore a recorded ACP session through official `session/load` or
`session/resume`, validate complete replay when available, and expose only
complete runtime-owned Snapshot/History projections without activating ACP in
production.

**Architecture:** A versioned main-only binding fixes Agent, artifact, wire,
workspace, and HostTool identity. `AcpSessionActor` installs a bounded V1 replay
collector before V1 `session/load`; only a completed replay becomes the actor's
ephemeral snapshot. V1 may use advertised `session/resume` when load is absent,
and V2 uses official `session/resume`. Resume-only actors continue future turns
without claiming a complete history projection.

**Tech Stack:** Electron 44, TypeScript 6, official
`@agentclientprotocol/sdk@1.4.0`, Vitest, and the shared Tea timeline reducer.

---

## Problem And Invariants

- Recovery uses the binding's exact Agent definition, artifact, wire version,
  workspace, native session id, and HostTool references.
- Binding data is bounded, versioned, non-secret, and never exposed to the
  renderer.
- V1 `loadSession` and `sessionCapabilities.resume` are normalized after
  initialization; V2 session support enables resume.
- Resume is valid exact-session recovery. New-session fallback, wire downgrade,
  and local-transcript reconstruction are not recovery.
- Replay installs before load, validates ownership/order/content, and publishes
  no partial snapshot.
- Replay and setup are bounded without real sleeps in tests.
- Failure closes MCP attachment, ACP connection, and broker scope exactly once.

## Task 1: Define The Runtime Binding

**Files:**

- Modify: `electron/conversation/runtime.ts`
- Create: `electron/conversation/acp/binding.ts`
- Create: `electron/conversation/acp/binding.test.ts`

1. Add a versioned renderer-neutral runtime binding and internal runtime handle.
2. Build ACP bindings from the selected definition, wire version, workspace,
   native session id, and immutable HostTool references.
3. Validate every field and exact match before launch; reject unknown fields,
   malformed ids, changed definitions/artifacts/workspaces, and changed tools.
4. Test valid binding round trips and every mismatch with synthetic values.

## Task 2: Select The Exact Wire And Capability

**Files:**

- Modify: `electron/conversation/acp/connection.ts`
- Modify: `electron/conversation/acp/connection.test.ts`

1. Normalize `supportsLoadSession` and `supportsResumeSession` from official
   initialization results.
2. Allow connection creation to require one recorded wire version.
3. Disable V2-to-V1 negotiation when an exact version is required.
4. Test exact V1 selection, unavailable versions, and normalized V1/V2 facts.

## Task 3: Collect A Bounded V1 Replay

**Files:**

- Create: `electron/conversation/acp/replay.ts`
- Create: `electron/conversation/acp/replay.test.ts`

1. Collect V1 user messages, assistant messages, and tool updates by session.
2. Reuse `AcpEventProjector` and `reduceConversationTurn` for product shape.
3. Bound updates, turns, and text bytes and reject unsupported visible content,
   output-before-prompt, wrong owner, empty replay, and unfinished tools.
4. Test multiple turns, chunking, tools, duplicates, malformed order, and every
   bound with deterministic synthetic notifications.

## Task 4: Restore Through The Session Actor

**Files:**

- Modify: `electron/conversation/acp/session.ts`
- Modify: `electron/conversation/acp/runtime.ts`
- Modify: `electron/conversation/acp/runtime.test.ts`

1. Add `restoreSession` for exact V1 `session/load` or V1/V2 `session/resume`
   with the same MCP attachment shape used by `session/new`.
2. Route load-time updates only to the replay collector and release the
   snapshot after load completes.
3. Maintain an ephemeral snapshot for subsequent live prompts and events when
   the actor owns a complete projection.
4. Keep Snapshot and History unsupported for resume-only suffix projections.
5. Test V1 replay success, V1/V2 resume, capability mismatch,
   load/resume/attachment/connection failures, snapshot immutability,
   pagination, and idempotent shutdown.

## Task 5: Document And Verify

**Files:**

- Update: `docs/adr/0022-official-acp-electron-runtime.md`
- Update: `docs/plans/2026-08-28-acp-foundation.md`
- Create: `docs/testing/acp-exact-session-recovery.md`

Run:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

Expected: exact load/resume recovery tests pass, resume-only history remains
explicitly unavailable, ACP remains unavailable/unregistered, and no packaging,
network, credential, real Agent, or captured transcript is used.

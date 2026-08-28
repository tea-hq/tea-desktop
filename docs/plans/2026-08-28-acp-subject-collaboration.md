# ACP Subject And Collaboration Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add disposable ACP subject generation and durable Channel turn
context without registering ACP runtimes or requiring `session/load` recovery.

**Architecture:** `AcpConversationRuntime` owns disposable subject sessions;
the main SQLite catalog owns Channel turn/source facts; and
`RuntimeConversationService` persists a driving-turn context before sending a
JSON-wrapped prompt through the existing runtime. Scoped Channel history stays
on the existing MCP broker and appends sanitized sources through the catalog
boundary.

**Tech Stack:** Electron main, TypeScript 6, Node SQLite, official
`@agentclientprotocol/sdk`, standard MCP, Vitest.

---

### Task 1: Freeze Subject Text Rules

**Files:**

- Create: `electron/conversation/subject.ts`
- Create: `electron/conversation/subject.test.ts`

1. Add failing tests for source truncation, output unwrapping, punctuation,
   control characters, maximum length, empty output, and source-equivalent
   output.
2. Run `npm run test:run -- electron/conversation/subject.test.ts` and confirm
   the tests fail because the module is absent.
3. Port the bounded prompt and normalization rules from the Tauri implementation.
4. Re-run the focused test and expect it to pass.

### Task 2: Generate Subjects In Disposable ACP Sessions

**Files:**

- Modify: `electron/conversation/acp/runtime.ts`
- Modify: `electron/conversation/acp/runtime.test.ts`

1. Add failing tests for successful V1/V2 collection, empty and malformed
   output, Agent failure, timeout cancellation, shutdown cancellation,
   duplicate generation, no HostTools, and exact cleanup.
2. Add an injectable scheduler and bounded raw-output collector.
3. Create the disposable actor outside `sessions`, `listeners`, bindings, and
   configured tool scopes. Require `runFinished`; reject `runFailed`.
4. Track pending subject actors so shutdown cancels and closes them before the
   runtime finishes shutting down.
5. Run the ACP runtime tests and expect all cases to pass.

### Task 3: Persist Channel Turn Context

**Files:**

- Create: `electron/conversation/collaboration.ts`
- Modify: `electron/storage/migrations.ts`
- Modify: `electron/conversation/catalog.ts`
- Modify: `electron/conversation/catalog.test.ts`

1. Add failing tests for explicit empty selection, bounded source validation,
   wrong-Channel rejection, per-turn deduplication, Agent-tool append,
   monotonically allocated indices, deletion, and reopen recovery.
2. Add normalized context/source tables to the unreleased schema version 1.
3. Implement validation and JSON prompt construction with structured APIs.
4. Implement catalog create/append/remove/snapshot operations in transactions.
5. Run catalog and collaboration tests and expect them to pass.

### Task 4: Orchestrate Driving Turns And Subjects

**Files:**

- Modify: `electron/conversation/service.ts`
- Modify: `electron/conversation/service.test.ts`

1. Add failing tests proving the catalog write precedes runtime dispatch,
   runtime rejection removes only the new context, empty source selection is
   preserved, resumed conversations allocate the next catalog turn, duplicate
   subject work is coalesced, and set-title-if-missing wins against late output.
2. Add service ports for collaboration/activity writes and implement send.
3. Strip renderer source DTOs from the runtime command after building the
   Channel prompt. Keep local conversation prompts unchanged.
4. Schedule non-fatal subject generation after an accepted turn and drain it
   during shutdown before closing the catalog.
5. Run service tests and expect them to pass.

### Task 5: Verify Boundaries

**Files:**

- Modify: `docs/testing/acp-runtime.md` if the current test inventory requires it.

Run:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

Expected: all checks pass; lint may retain only the repository's documented
existing warnings. Confirm ACP runtime descriptors remain unavailable and the
Electron renderer receives no ACP messages, bindings, source database rows, or
Node APIs.

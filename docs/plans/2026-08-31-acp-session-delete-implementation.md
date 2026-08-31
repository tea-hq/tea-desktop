# ACP Session Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add canonical ACP session deletion to Tea while keeping archive as a Tea-local soft state.

**Architecture:** The Electron main process remains the only owner of ACP sessions and the durable conversation catalog. ACP initialization capabilities are normalized into typed runtime facts; `session/delete` is exposed through the `ConversationRuntime` port and is executed against the exact persisted runtime binding, including for inactive sessions. A successful Agent-side delete is required before the local catalog row is removed; archive continues to write only `archived_at` and never calls ACP.

**Tech Stack:** Electron main, TypeScript, official `@agentclientprotocol/sdk@1.4.0` stable V1 plus experimental V2, Vue/Pinia client contracts, SQLite catalog, Vitest.

---

## Invariants and Scope

- ACP V1 advertises deletion at `agentCapabilities.sessionCapabilities.delete`.
- ACP V2 advertises deletion at `initialize.capabilities.session.delete`.
- The request is `session/delete` with `{ sessionId }`; there is no standard `session/archive`.
- `session/close` is resource cleanup and must not be treated as deletion.
- Missing delete capability returns the stable `unsupportedCapability` error and leaves the catalog unchanged.
- The catalog row is removed only after the Agent acknowledges deletion. Any Agent or catalog failure leaves the row available for retry.
- Renderer code remains unaware of ACP method names and does not branch on runtime names.

## Task 1: Add failing capability-normalization tests

**Files:**

- Modify: `electron/conversation/acp/connection.test.ts`
- Modify: `electron/conversation/acp/connection.ts`

Add assertions for V1 and V2 delete/close capability normalization, including absent and malformed capability objects. Preserve the existing `normalizeAcpRecoveryCapabilities` export name to avoid an unnecessary compatibility alias, but extend its result with `supportsDeleteSession` and `supportsCloseSession`.

Run `pnpm exec vitest run electron/conversation/acp/connection.test.ts`; the new assertions must fail before implementation.

## Task 2: Extend the runtime port and binding validation

**Files:**

- Modify: `electron/conversation/runtime.ts`
- Modify: `electron/conversation/acp/binding.ts`
- Modify: `src/features/conversation/contracts.ts` only if a public runtime capability is needed

Add `deleteConversation(conversationId, binding, options?)` to `ConversationRuntime`. The ACP binding validator should support an identity-only validation mode for deletion, because deleting a session does not need to recreate HostTool MCP attachments. Runtime identity, artifact, protocol version, native session id, and absolute workspace must still be validated against the active Agent definition.

Update all test doubles implementing `ConversationRuntime`.

## Task 3: Implement ACP actor deletion

**Files:**

- Modify: `electron/conversation/acp/session.ts`
- Modify: `electron/conversation/acp/runtime.ts`
- Test: `electron/conversation/acp/runtime.test.ts`

Add a typed actor method that:

1. Requires an active session and `supportsDeleteSession`.
2. Cancels and settles an active prompt before deletion.
3. Awaits V1 or V2 `session/delete` with the opaque native session id.
4. Always closes MCP/ACP/process resources after the request, preserving the primary error if cleanup also fails.

Add runtime coverage for V1 and V2 active deletion, unsupported capability, idempotent cleanup, malformed binding rejection, and the guarantee that `session/close` is not substituted for `session/delete`.

## Task 4: Implement inactive-session deletion

**Files:**

- Modify: `electron/conversation/acp/runtime.ts`
- Test: `electron/conversation/acp/runtime.test.ts`

When no actor is active, open a fresh ACP connection using the binding's exact wire version, workspace path, artifact definition, and resolved provider options, inspect the negotiated delete capability, issue `session/delete`, and close the temporary connection. Do not call `session/load` or `session/resume`, since deletion must work even when history recovery is unavailable. Do not attach HostTools because `session/delete` has no MCP payload.

## Task 5: Coordinate catalog deletion in the main service

**Files:**

- Modify: `electron/conversation/service.ts`
- Modify: `electron/conversation/service.test.ts`
- Modify: `electron/conversation/commandService.ts` only if the port shape changes

Resolve the catalog record first, wait for pending restoration, and call the runtime delete port with the stored binding and provider selection. Remove active subscriptions and the catalog row only after the runtime operation succeeds. Preserve the existing unknown-conversation and shutdown error semantics. Add tests for active and inactive rows, unsupported Agent capability, Agent failure, catalog failure, and retryability.

## Task 6: Verify renderer and product semantics

**Files:**

- Modify: `docs/plans/2026-08-22-agent-session-management.md` to remove the outdated statement that permanent deletion is unavailable once this implementation lands.
- Add or update `docs/testing/electron-acp-processes.md` and `docs/testing/electron-conversation-catalog.md` with delete/archive acceptance cases.

Keep `archiveConversation` unchanged as local soft archive. The existing renderer `deleteConversation` command remains a product action but now reaches canonical Agent deletion through the main runtime boundary.

## Verification

Run, in order:

```sh
pnpm exec vitest run electron/conversation/acp/connection.test.ts electron/conversation/acp/runtime.test.ts electron/conversation/service.test.ts electron/conversation/catalog.test.ts
pnpm run type-check
pnpm run format:check
pnpm run lint
node scripts/check-ui-boundaries.mjs
pnpm run build:web
```

Do not run Electron packaging or the local `build` script. No commit is created without explicit user instruction.

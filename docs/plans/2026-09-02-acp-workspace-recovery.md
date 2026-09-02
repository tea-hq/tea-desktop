# ACP Workspace Recovery Implementation Plan

**Goal:** Report a missing historical ACP working directory as a stable,
non-retryable failure and let the user explicitly relocate that conversation to
another directory without losing the original durable binding on failure.

**Architecture:** Electron main remains the owner of workspace validation,
runtime recovery, and durable binding updates. The renderer preserves typed
error metadata and exposes two intents: retry the unchanged restore, or choose a
replacement directory for `workspaceUnavailable`. Relocation restores the exact
native ACP session against a candidate binding before atomically replacing the
catalog binding and summary.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, SQLite,
`@agentclientprotocol/sdk`, Vitest.

---

### Task 1: Define and detect an unavailable workspace

Modify `electron/conversation/runtime.ts` and the ACP runtime boundary. Add the
stable `workspaceUnavailable` error code and preflight the effective ACP cwd as
an accessible directory before connecting or spawning. Return
`retryable: false`; never substitute `process.cwd()` for an invalid stored
binding.

Add deterministic ACP runtime tests for missing paths, non-directories, and
inaccessible directories, proving connection startup is not attempted.

### Task 2: Make workspace relocation an atomic main-owned operation

Modify `electron/conversation/service.ts`, `electron/conversation/catalog.ts`,
and their contracts. Add `relocateConversationWorkspace(conversationId,
workspacePath)`, serialized through the conversation restore gate. Validate and
canonicalize the candidate, restore the exact native session with a candidate
binding, and persist the binding plus summary only after recovery succeeds.

If ACP recovery fails, close the candidate runtime and retain the prior catalog
row. If the catalog update fails, close the candidate runtime and retain the
prior durable binding. Successful relocation clears the restore failure.

### Task 3: Keep persisted working-directory facts consistent

Modify the SQLite migration and catalog decoder. Upgrade schema version 2 to 3
and backfill `working_directory` from a valid binding `workspacePath` where the
column is null. Require local conversation summaries to match their effective
binding workspace. New conversations persist the runtime handle's effective
workspace rather than only the optional requested value.

Add migration, catalog validation, successful relocation, recovery failure,
persistence compensation, and restore/relocation serialization tests.

### Task 4: Thread relocation through the typed desktop boundary

Modify `electron/conversation/commandService.ts`,
`electron/ipc/conversationCommands.ts`, `src/types/electronBridge.ts`, and
`src/infrastructure/conversation/electronConversationClient.ts`. Add the typed
`relocate_conversation_workspace` command and return a complete
`ConversationDetail` after success.

### Task 5: Preserve typed UI errors and expose recovery intent

Modify conversation contracts, store, app actions, and thread components.
Preserve `code` and `retryable` in `ConversationUiError`. Allow an explicit
same-id reload so ordinary retry invokes the backend again. Hide ordinary retry
for non-retryable failures and show a directory-selection action only for
`workspaceUnavailable`. The app action uses the existing native directory
picker and delegates relocation to the store.

Add store and component tests plus matching English and Simplified Chinese
copy. Components only render state and emit intent.

### Task 6: Verify

Run `npm run type-check`, `npm run test:run`, `npm run format:check`,
`npm run lint`, `node scripts/check-ui-boundaries.mjs`, and `npm run build:web`.
Do not run Electron packaging.

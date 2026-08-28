# ACP Durable Conversation Catalog Implementation Plan

**Goal:** Persist exact runtime bindings in Electron main and coordinate
idempotent runtime creation and cold recovery without activating ACP.

**Owner and invariant:** `RuntimeConversationService` owns catalog/runtime
coordination. `ConversationCatalog` owns durable Desktop identity and sidebar
metadata. A runtime owns live session state and canonical conversation facts.
Success is never reported before the local catalog write completes.

## Step 1: Add Per-Conversation Runtime Cleanup

- Modify `ConversationRuntime` with `closeConversation(conversationId)`.
- Implement idempotent active-session cleanup in `AcpConversationRuntime`.
- Remove listeners and configured HostTool scope even when session close fails.
- Test one-session isolation, repeated close, HostTool cleanup, and unknown ids.

Verification:

```sh
npm run test:run -- electron/conversation/runtimeRegistry.test.ts electron/conversation/acp/runtime.test.ts
```

## Step 2: Add The Versioned SQLite Owner

- Add a bounded `node:sqlite` database wrapper and version-1 migration.
- Add a strict catalog row codec for runtime binding and Channel metadata.
- Implement create/get/idempotency lookup, keyset listing, restore-failure
  markers, and close.
- Reject unsupported schema versions, malformed rows, invalid cursors, and
  writes after shutdown with stable error codes.

Verification:

```sh
npm run test:run -- electron/conversation/catalog.test.ts
```

## Step 3: Add Runtime Application Coordination

- Add a HostTool reference resolver port.
- Implement idempotent create with catalog-write compensation.
- Implement cold restore with exact HostTool resolution and binding delegation.
- Deduplicate concurrent create/restore operations in process.
- Preserve catalog binding and record bounded stable failures on restore.

Verification:

```sh
npm run test:run -- electron/conversation/service.test.ts
```

## Step 4: Compose Without Activating ACP

- Initialize `$APP_DATA/conversation-catalog.sqlite3` from `electron/main.ts`.
- Give the new service ownership of runtime-registry shutdown and catalog close.
- Keep the registry empty and keep legacy renderer-visible runtime behavior
  unchanged.
- Document database inspection, recovery behavior, and test coverage.

Verification:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

## Deferred Activation Gate

Do not register an ACP Agent definition or expose catalog commands through IPC
until model/mode mapping, subject generation, collaboration context, and the
compatibility matrix are complete. Do not import legacy JSON transcripts into
the runtime catalog.

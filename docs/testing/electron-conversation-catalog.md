# Electron Runtime Conversation Catalog

## Scope

This matrix covers the main-owned runtime catalog introduced by ADR 0026 and
used by the active Electron ACP conversation host. Unit tests use synthetic
runtimes and do not claim live Agent or packaged-process compatibility.

The database is `$APP_DATA/conversation-catalog.sqlite3`. It contains Desktop
identity, bounded sidebar metadata, and normalized Channel turn/source context.
ACP transcripts, HostTool schemas, credentials, environment values, executable
paths, attachment endpoints, provider extensions, and diagnostics are out of
scope and must not appear in the file.

## Automated Coverage

| Boundary | Scenario                                   | Expected result                                       |
| -------- | ------------------------------------------ | ----------------------------------------------------- |
| Schema   | Empty database                             | Strict version-1 schema is created transactionally    |
| Schema   | Unsupported `user_version`                 | Startup fails and the file remains unchanged          |
| Codec    | Malformed binding JSON                     | Typed `corruptCatalog`; no partial identity returned  |
| Catalog  | Duplicate conversation or idempotency id   | Typed conflict; existing row remains intact           |
| Catalog  | Equal timestamps                           | `conversation_id DESC` is the stable tie-breaker      |
| Catalog  | Opaque cursor and Channel filters          | Keyset page contains no offset-based duplicates       |
| Catalog  | Restore failure marker                     | Only bounded code/time are stored and can be cleared  |
| Catalog  | Explicit empty Channel selection           | One durable context row with zero sources             |
| Catalog  | Repeated selected or tool evidence         | Per-turn message identity is deduplicated             |
| Catalog  | Reopen Channel-bound conversation          | Context order and next turn index remain stable       |
| Runtime  | Catalog write fails after session creation | Only the new conversation is closed                   |
| Runtime  | Concurrent identical creates               | One runtime session and one catalog row               |
| Runtime  | Same key with changed identity             | Rejected before runtime creation                      |
| Runtime  | Cold restore                               | Exact binding and HostTool references are delegated   |
| Runtime  | Creation HostTool reference                | Main definition replaces all renderer-owned schema    |
| Runtime  | Unknown creation HostTool                  | Fails before runtime configuration or session create  |
| Runtime  | HostTool resolver changes a revision       | Restore fails before Agent startup                    |
| Runtime  | `session/resume`-capable binding           | Recovery is allowed without requiring load/history    |
| Runtime  | Resume followed by a Channel turn          | Catalog allocates the next index without a snapshot   |
| Runtime  | Active Agent deletion                      | `session/delete` completes before local cleanup       |
| Runtime  | Inactive Agent deletion                    | Exact persisted wire version is used; no restore call |
| Runtime  | Agent deletion failure                     | Catalog row remains for a later retry                 |
| Runtime  | Local archive                              | `archived_at` changes without ACP deletion            |
| Shutdown | App exits                                  | Runtime registry and SQLite connection close once     |

## Failure And Recovery

- Catalog open or migration failure prevents host startup. There is no memory
  or JSON fallback.
- A create is successful only after the SQLite row commits. Failed persistence
  compensates through `ConversationRuntime.closeConversation`.
- Restore keeps the original binding unchanged. Failure records a stable code
  and timestamp; a later successful restore clears the marker.
- A corrupt or unsupported database is preserved for diagnosis. Tests and the
  application do not auto-delete or recreate it.
- Production registration is gated atomically on both pinned Agent artifacts.
  These catalog tests inject runtimes and launch no live Claude/Codex process.

## Verification

```sh
npm run test:run -- electron/conversation/catalog.test.ts electron/conversation/service.test.ts
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

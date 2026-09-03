# Saved Messages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a complete private saved-message workflow with a cross-channel catalog, source navigation, forwarding, Agent staging, and deletion.

**Architecture:** `ChannelTransport` exposes provider-neutral save, list, and remove methods with opaque pagination. Yunxin owns its collection DTOs, message converter, versioned payload, and anchor cache; Electron only validates and delegates. `useChannelsStore` owns asynchronous catalog state and stale-result recovery, while Vue components render state and emit intent.

**Tech Stack:** Vue 3, TypeScript, Pinia, Electron context-isolated IPC, Yunxin V2 message collections, Vitest, Vue Test Utils.

**Execution note:** Do not commit, push, or create a PR during this task.

---

### Task 1: Provider-Neutral Contract And Payload Codec

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Create: `src/infrastructure/channels/yunxinSavedMessages.ts`
- Create: `src/infrastructure/channels/yunxinSavedMessages.test.ts`

**Steps:**

1. Add `SavedMessage`, `SavedMessagePage`, `ListSavedMessagesRequest`, and `SaveMessageRequest` contracts.
2. Add `message.save` and `message.save.list` capabilities plus `saveMessage`, `listSavedMessages`, and `removeSavedMessage` transport methods.
3. Define a bounded version-1 Yunxin collection payload containing the serialized provider message and source display metadata. Keep the payload module inside the Yunxin adapter boundary.
4. Test valid round trips, legacy external collection payloads, unsupported versions, malformed JSON, oversized fields, and stable message identity.
5. Run `npm run test:run -- src/infrastructure/channels/yunxinSavedMessages.test.ts` and `npm run type-check`.

### Task 2: Mock And Yunxin Adapters

**Files:**

- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.test.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

**Steps:**

1. Write failing adapter tests for idempotent save, newest-first pagination, cursor validation, removal, malformed collection omission, and provider failures.
2. Implement Mock storage using immutable provider-neutral snapshots and deterministic cursors.
3. Implement Yunxin `addCollection`, `getCollectionListExByOption`, and `removeCollections` calls with collection DTOs retained only in adapter memory.
4. Deserialize listed messages through `V2NIMMessageConverter`, remember them for existing forward behavior, map them to `SavedMessage`, deduplicate, and return opaque collection-id cursors.
5. Translate collection limit error `189301` to stable `limitExceeded`; use existing `invalidRequest`, `transport`, and `protocolFailure` semantics elsewhere.
6. Run both adapter test files and type-check.

### Task 3: Electron Boundary

**Files:**

- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.test.ts`

**Steps:**

1. Add `save_channel_message`, `list_saved_channel_messages`, and `remove_saved_channel_message` commands.
2. Validate top-level records and bounded strings in IPC handlers, then delegate to `ElectronChannelService`.
3. Add preload allowlist entries and renderer transport methods.
4. Test exact serialized command payloads and returned provider-neutral values.
5. Run the Electron transport tests and type-check.

### Task 4: Store-Owned Catalog Workflow

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Steps:**

1. Write failing tests for initial load, append pagination, dedupe, save insertion, removal, stale response rejection, account reset, and error preservation.
2. Add catalog refs for items, total count, cursor, `hasMore`, loading states, mutation state, and stable error code.
3. Implement `loadSavedMessages`, `loadMoreSavedMessages`, `saveMessage`, `removeSavedMessage`, and `clearSavedMessages` in the store.
4. Merge catalog messages into the message projection only for navigation/forwarding while preserving saved snapshots after source delete or history clear.
5. Run the store tests and type-check.

### Task 5: Saved Catalog UI And Agent Integration

**Files:**

- Modify: `src/features/channels/components/ChannelMessageActions.vue`
- Modify: `src/features/channels/components/ChannelMessageActions.test.ts`
- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Create: `src/features/channels/components/ChannelSavedMessagesDialog.vue`
- Create: `src/features/channels/components/ChannelSavedMessagesDialog.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/app/E2eFixtureApp.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Steps:**

1. Add a save action for active messages and a global saved-messages icon beside global search.
2. Build an unframed, paginated dialog with loading, partial error, empty, remove-pending, and load-more states.
3. Emit only `select`, `forward`, `stageAgent`, `remove`, `retry`, and `loadMore` intents from the dialog.
4. In `ChannelWorkspace`, delegate source navigation to `jumpToMessage`, forwarding to the existing forward dialog, Agent staging to `forwardToAgent`, and mutations to the store.
5. Add every visible and accessible string to both locales.
6. Add a `saved-messages` E2E fixture and verify 1280px English plus 390px Chinese without overflow or overlap.
7. Run component tests, UI boundary checks, and type-check.

### Task 6: Decision Record And Full Verification

**Files:**

- Create: `docs/adr/0038-provider-neutral-saved-message-catalog.md`

**Steps:**

1. Record source of truth, payload version, N-API replacement requirements, error/recovery behavior, migration, rollback, and cross-client compatibility.
2. Run `npm run type-check`.
3. Run `npm run test:run`.
4. Run `npm run format:check` and `npm run lint`.
5. Run `node scripts/check-ui-boundaries.mjs --enforce` and compare against the existing 11-item baseline.
6. Run `npm run build:web`, `npm run build:runner`, and `git diff --check`.

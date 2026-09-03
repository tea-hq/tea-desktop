# Durable IM Channel Drafts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve per-conversation IM text and mention drafts across channel switches and desktop restarts without coupling Tea to the Yunxin SDK.

**Architecture:** A provider-neutral `ChannelDraftClient` is injected beside `ChannelTransport`. Electron main owns a versioned, atomically written local draft catalog scoped by IM `accountRef` and `channelRef`; the channel store owns loading, coalesced persistence, recovery, and UI projection. The composer remains controlled and only emits intent, while the sidebar renders a Slack-style localized Draft preview. Expiring attachment tokens are intentionally excluded.

**Tech Stack:** Electron main, TypeScript, Vue 3, Pinia, context-isolated IPC, `JsonStore`, Vitest, Vue Test Utils.

---

## Problem And Invariants

- Composer text currently lives inside `ChannelTimeline` and is erased with the component.
- Existing SQLite `channel_drafts` belong to Agent collaboration, not human IM input.
- Durable draft identity is exactly `(accountRef, channelRef)`. Tenant or account changes must never expose another account's drafts.
- Persist text plus validated mention targets, labels, and ranges. Never persist attachment picker tokens, credentials, provider objects, or SDK handles.
- A send failure preserves the controlled draft. A complete send removes it durably.
- Persistence failure keeps IM connected and the in-memory draft available for retry.
- Schema version 1 is the pre-1.0 storage contract. Unknown/corrupt files are preserved by `JsonStore` recovery and start with an empty catalog; no compatibility aliases or duplicate readers are added.

### Task 1: Define The Draft Port

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Test: `src/features/channels/contracts.test.ts`

**Step 1: Write failing contract tests**

Cover identity, text, bounded mentions, timestamps, and provider-free list/save/remove operations.

**Step 2: Add the provider-neutral types**

Add `ChannelDraft`, `SaveChannelDraftRequest`, and `ChannelDraftClient`. Do not add attachments or Yunxin types.

**Step 3: Run `npx vitest run src/features/channels/contracts.test.ts`**

### Task 2: Persist Drafts In Electron Main

**Files:**

- Create: `electron/services/channelDrafts.ts`
- Create: `electron/services/channelDrafts.test.ts`
- Create: `electron/ipc/channelDraftCommands.ts`
- Create: `electron/ipc/channelDraftCommands.test.ts`
- Modify: `electron/ipc/desktopCommandRouter.ts`
- Modify: `electron/ipc/desktopCommandRouter.test.ts`
- Modify: `electron/main.ts`
- Modify: `src/types/electronBridge.ts`

**Step 1: Write failing service tests**

Cover account isolation, replacement, removal, bounds, ordering, reload, and recovery.

**Step 2: Implement the catalog**

Use `JsonStore` with schema version 1 and a bounded file size. Normalize every loaded and incoming row. Complete the local save before returning success.

**Step 3: Write IPC tests**

Cover malformed arguments with stable `invalidRequest` errors.

**Step 4: Add the commands**

Add `list_im_channel_drafts`, `save_im_channel_draft`, and `remove_im_channel_draft`. Register a dedicated handler group and service in the composition root.

**Step 5: Run `npx vitest run electron/services/channelDrafts.test.ts electron/ipc/channelDraftCommands.test.ts electron/ipc/desktopCommandRouter.test.ts electron/preload.test.ts`**

### Task 3: Add Renderer Draft Clients

**Files:**

- Create: `src/infrastructure/channels/ElectronChannelDraftClient.ts`
- Create: `src/infrastructure/channels/ElectronChannelDraftClient.test.ts`
- Create: `src/infrastructure/channels/MemoryChannelDraftClient.ts`
- Create: `src/infrastructure/channels/MemoryChannelDraftClient.test.ts`
- Modify: `src/infrastructure/channels/channelComposition.ts`
- Modify: `src/app/useWorkspaceRuntime.test.ts`

**Step 1: Write failing client tests**

Assert exact IPC calls, deep copies, account isolation, and removal.

**Step 2: Implement both adapters**

Electron delegates to allowlisted IPC. Preview/test mode uses an in-memory implementation with the same contract.

**Step 3: Inject the client and run tests**

Add `draftClient` to `ChannelEnvironment` and pass it into the channel store during workspace initialization.

Run: `npx vitest run src/infrastructure/channels/ElectronChannelDraftClient.test.ts src/infrastructure/channels/MemoryChannelDraftClient.test.ts src/app/useWorkspaceRuntime.test.ts`.

### Task 4: Make The Store The Draft Workflow Owner

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Step 1: Write failing store tests**

Cover account load/change, optimistic projection, coalescing, flush, failure/retry, and removal after send.

**Step 2: Add draft state and actions**

Expose `drafts`, `activeDraft`, `draftSavingRefs`, `draftErrorCode`, `updateDraft`, `flushDraft`, and `clearDraft`. Serialize writes per channel and ignore stale lifecycle completions.

**Step 3: Integrate lifecycle**

Load after the connected status exposes `accountRef`; clear projections on account/workspace disposal; flush the previous active draft before channel selection and all dirty drafts before disposal.

**Step 4: Run `npx vitest run src/features/channels/store.test.ts` without real sleeps or network access**

### Task 5: Convert The Composer To Controlled State

**Files:**

- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`

**Step 1: Write failing component tests**

Cover restored text/mentions, structured updates, mention selection, send failure, and accessible save errors.

**Step 2: Replace local draft ownership**

Accept controlled draft props and emit draft intent. Keep only ephemeral mention-menu navigation state locally.

**Step 3: Wire send completion and run tests**

Pass store draft state through `ChannelWorkspace`. Remove the durable draft only after all requested text/media sends succeed; preserve it on any failure.

Run: `npx vitest run src/features/channels/components/ChannelTimeline.test.ts src/app/components/ChannelWorkspace.test.ts`.

### Task 6: Show Slack-Style Draft Previews

**Files:**

- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Modify: `src/features/channels/components/ChannelSidebar.test.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/app/E2eFixtureApp.vue`

**Step 1: Write failing sidebar tests**

Cover localized labels and trimmed preview replacement for non-empty drafts.

**Step 2: Render the draft projection**

Keep channel rows unframed and stable. Use restrained status color for the Draft label and preserve trailing time/status controls.

**Step 3: Add locale parity and fixture state, then test**

Add every key to English and Chinese and include one synthetic draft in the fixture.

Run: `npx vitest run src/features/channels/components/ChannelSidebar.test.ts`.

### Task 7: Document And Verify

**Files:**

- Create: `docs/adr/0040-durable-im-channel-drafts.md`

**Step 1: Record the decision**

Document ownership, provider replacement boundary, schema versioning, migration policy, rollback/recovery, capacity limits, account isolation, error semantics, and the deliberate attachment-token exclusion.

**Step 2: Run focused and full checks**

Run:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
VITE_E2E=true npm run build:web
npm run build:runner
git diff --check
```

**Step 3: Visually verify**

Check desktop and 390px English/Chinese layouts, restored composer text, Draft previews, long text truncation, saving failure, keyboard focus, and no horizontal overflow. Reset any temporary browser viewport override.

**Step 4: Commit in phases**

Create separate Conventional Commits for production behavior, tests/fixtures, and architecture documentation. End every AI-authored commit with `Model: gpt-5`. Do not push or open a PR.

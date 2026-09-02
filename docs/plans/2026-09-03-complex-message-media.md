# Complex Message Media Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add provider-neutral received image, video, and file preview/save workflows without exposing provider URLs or filesystem behavior to Vue components.

**Architecture:** Image and video viewing are ephemeral renderer projections owned by the channel workspace. User-initiated saving crosses a dedicated `ChannelMediaClient` with a `MessageRef`; Electron main asks the active channel provider to resolve the authoritative media source, prompts for a destination, and performs a bounded cancellable HTTPS download with an atomic local write. A future Yunxin N-API adapter replaces source resolution without changing the store, components, preload contract, or save service.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron context-isolated IPC, Node fetch/streams/filesystem, Vitest, Playwright.

---

## Problem And Invariants

The current received-media surface renders provider URLs directly through `<img>`, native `<video controls>`, and a new-window file link. That is sufficient to prove SDK mapping, but it makes Vue responsible for provider source details and gives saving no stable cancellation, failure, retry, or filesystem semantics.

The implementation must preserve these invariants:

- UIKit is evidence for provider SDK calls and attachment fields only. Tea owns the interaction design.
- Vue components render state and emit intent. They never fetch media, build Yunxin CDN query strings, open filesystem dialogs, or write files.
- A save request contains a `MessageRef` and Tea-owned operation id, never a URL or provider message object.
- The active provider adapter resolves media from its authoritative cached message. Missing, revoked, non-media, or URL-less messages fail with stable codes.
- A provider replacement affects only source resolution. The renderer client, IPC, service, store, and components remain provider-neutral.
- Viewer state is ephemeral and cleared on close, account teardown, channel lifecycle changes, message deletion/revocation, or replacement with non-viewable content.
- Save state is ephemeral, bounded, account-scoped, and rejects stale completions by generation and operation id.
- Cancel closes an active download and removes its partial file. Closing the destination dialog returns a successful `cancelled` result rather than an error.
- Only HTTPS sources are accepted. Redirect count, response size, elapsed time, and filename length are bounded.
- The destination is written to a sibling temporary file and atomically renamed only after the complete body is flushed. Every failure and cancellation path cleans up the partial file.
- User-initiated saving remains separate from the future encrypted offline media repository and its retention policy.

## Design Decision

Use a dedicated host-owned media save service and a narrow provider source resolver.

Rejected alternatives:

- Renderer `fetch` plus anchor download leaks provider URLs, network behavior, filesystem failures, and N-API migration work into the UI.
- Adding save methods directly to generic message components turns presentational code into a workflow owner.
- Building encrypted offline caching now conflates an explicit user save with automatic retention, encryption, quota, and eviction lifecycles.

The chosen flow is:

```text
ChannelMessageItem intent
  -> Channels store save projection
  -> ChannelMediaClient
  -> allowlisted preload command
  -> ElectronChannelMediaService
  -> ChannelMediaSourceResolver
  -> Yunxin cached provider message (future N-API adapter)
  -> save dialog + bounded HTTPS stream + atomic rename
```

## Stable Contracts

`ChannelMediaClient` exposes:

```ts
interface ChannelMediaSaveRequest {
  operationId: string
  messageRef: MessageRef
}

type ChannelMediaSaveResult =
  { status: 'saved'; fileName: string; byteLength: number } | { status: 'cancelled' }

interface ChannelMediaClient {
  save(request: ChannelMediaSaveRequest): Promise<ChannelMediaSaveResult>
  cancel(operationId: string): Promise<void>
}
```

The store projects `idle | choosing | saving | saved | failed | cancelled` per message. Error codes are `messageUnavailable`, `mediaUnavailable`, `unsupportedProtocol`, `tooLarge`, `downloadFailed`, `writeFailed`, `cancelled`, and `unknown`; only download/write/unknown failures may be retryable. IPC command failures continue to use the existing stable command envelope.

The host-only resolver returns normalized metadata:

```ts
interface ChannelMediaSource {
  url: string
  fileName: string
  mimeType?: string
  expectedSize?: number
}

interface ChannelMediaSourceResolver {
  resolve(messageRef: MessageRef): ChannelMediaSource
}
```

Yunxin resolution maps the cached raw message through the existing provider-neutral mapper, accepts image/audio/video/file content, and returns its current normalized source. No provider CDN transformations are constructed outside the adapter.

### Task 1: Add Provider-Neutral Contracts And Clients

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Create: `src/infrastructure/channels/ElectronChannelMediaClient.ts`
- Create: `src/infrastructure/channels/ElectronChannelMediaClient.test.ts`
- Create: `src/infrastructure/channels/MockChannelMediaClient.ts`
- Create: `src/infrastructure/channels/MockChannelMediaClient.test.ts`

**Steps:**

1. Add the save request/result/state/error/client contracts and keep them independent of Electron and Yunxin.
2. Write failing tests for command mapping, stable error mapping, cancel idempotence, and deterministic mock resolution.
3. Implement Electron and mock clients.
4. Run `npm run test:run -- src/infrastructure/channels/ElectronChannelMediaClient.test.ts src/infrastructure/channels/MockChannelMediaClient.test.ts` and `npm run type-check`.
5. Commit as `feat: add provider-neutral channel media client`.

### Task 2: Resolve Provider Media Sources

**Files:**

- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`
- Modify: `electron/services/channel.ts`
- Modify: `electron/services/channel.test.ts`

**Steps:**

1. Write failing tests for image/video/file/audio source resolution, missing cached messages, revoked messages, non-media content, and missing URLs.
2. Add a host-facing provider-neutral `resolveMediaSource(messageRef)` method that reads the current cached provider message and returns normalized metadata.
3. Delegate the resolver through `ElectronChannelService`; do not add it to the renderer `ChannelTransport` interface.
4. Run the targeted Yunxin and channel service tests plus type-check.
5. Commit as `feat: resolve channel media from provider messages`.

### Task 3: Implement The Electron Save Service

**Files:**

- Create: `electron/services/channelMedia.ts`
- Create: `electron/services/channelMedia.test.ts`

**Steps:**

1. Write deterministic tests with injected destination selection, fetch, filesystem destination, clock/ids, and abort signals.
2. Cover invalid operation ids, duplicate operations, dialog cancellation, unsupported/non-HTTPS sources, redirect loops/downgrades, response failures, invalid/oversized `content-length`, streamed overflow, abort, write failure, and rename failure.
3. Implement a maximum of five HTTPS redirects, a 30-second abort timeout, a 1 GiB response limit, and bounded metadata.
4. Stream into a sibling exclusive temporary file, close it before rename, and unlink it from every non-success path.
5. Make `cancel` idempotent and ensure a late transport completion cannot publish success.
6. Run `npm run test:run -- electron/services/channelMedia.test.ts` and type-check.
7. Commit as `feat: save channel media atomically in Electron`.

### Task 4: Add Main And Preload IPC Boundaries

**Files:**

- Modify: `src/types/electronBridge.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `electron/ipc/channelCommands.test.ts`
- Modify: `electron/ipc/desktopCommandRouter.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.test.ts`

**Steps:**

1. Write failing boundary tests for allowlisted save/cancel commands and strict `MessageRef`/operation id validation.
2. Register `save_channel_media` and `cancel_channel_media_save` with the stable command result envelope.
3. Construct one save service in main, inject the active `BrowserWindow` save dialog, and use `ElectronChannelService` as the source resolver.
4. Cancel all active saves during app shutdown before disposing the channel provider.
5. Run IPC, preload, and type-check tests.
6. Commit as `feat: expose channel media saving through IPC`.

### Task 5: Project Save And Viewer Lifecycles In The Store

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Steps:**

1. Write failing tests for configure/dispose, open/close viewer, previous/next navigation, save, dialog cancellation, retry, explicit cancel, stale completion rejection, mutual exclusion, and bounded projections.
2. Keep one active image/video viewer target and derive navigation from the current active message window.
3. Keep at most 128 recent save projections and at most one active save operation.
4. Clear or cancel affected state on account teardown, transport replacement, channel deletion/history clearing, message deletion/revocation, and content/source replacement.
5. Return typed actions and computed projections without putting copy in the store.
6. Run the store tests and type-check.
7. Commit as `feat: manage channel media workflows in the store`.

### Task 6: Build Slack-Style Media Interaction

**Files:**

- Create: `src/features/channels/components/ChannelMediaViewer.vue`
- Create: `src/features/channels/components/ChannelMediaViewer.test.ts`
- Create: `src/features/channels/components/ChannelMediaSaveControl.vue`
- Create: `src/features/channels/components/ChannelMediaSaveControl.test.ts`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`

**Steps:**

1. Write failing component tests for accessible open/save/cancel/retry intents and disabled selection mode.
2. Replace raw file links and native inline video controls with compact message attachments and explicit icon actions.
3. Open images/videos in one unnested `TeaDialog`-based viewer with previous/next, save, close, image alt text, video controls, loading/error fallbacks, and keyboard behavior.
4. Keep attachment rows dense and unframed, with name/type/size metadata and icon tooltips similar to Slack while using Tea tokens and MDI icons.
5. Render save states without shifting message geometry and announce saving/saved/failed state through an appropriate live region.
6. Run component and timeline tests plus type-check.
7. Commit as `feat: add channel media preview and save controls`.

### Task 7: Wire Workspace, Composition, Fixtures, And Copy

**Files:**

- Modify: `src/infrastructure/channels/channelComposition.ts`
- Modify: `src/app/workspaceLifecycle.ts`
- Modify: `src/app/workspaceLifecycle.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/app/E2eFixtureApp.vue`
- Modify: `tests/e2e/fixtures/app.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/locales/locales.test.ts`

**Steps:**

1. Configure the Electron client with account lifecycle and dispose it on logout/unmount.
2. Wire timeline/viewer intents to store actions; close the viewer on channel selection and workspace teardown.
3. Add synthetic fixtures for image viewer, video viewer, choosing/saving, saved, retryable failure, and missing media.
4. Add every user-facing string to both locales.
5. Run workspace, locale, and fixture tests.
6. Commit as `feat: wire channel media workflows into the workspace`.

### Task 8: Validate And Record The Decision

**Files:**

- Create: `docs/adr/0045-provider-neutral-channel-media-workflows.md`
- Modify: `docs/README.md`

**Steps:**

1. Record ownership, source-of-truth, stable errors, cancellation, recovery, security bounds, provider replacement, and the separation from offline retention.
2. Run focused unit tests followed by the default project checks:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

3. Build the fixture with `VITE_E2E=true` and visually verify all media states in English and Chinese at desktop and 390px width.
4. Verify keyboard focus, escape/overlay dismissal, disabled actions, reduced motion, no overlap/overflow, and no console errors.
5. Commit as `docs: record provider-neutral channel media workflows`.

## Recovery And Rollback

- A cancelled or failed save is retryable from the same `MessageRef` while the provider still owns the message.
- Reconnect/message reload repopulates the provider cache; the store never preserves or replays provider URLs.
- A service crash can leave no finalized partial file because only the sibling `.part` path is written before rename. A later housekeeping pass may remove stale `.part` files, but that is not required for normal in-process cleanup.
- Each task is a standalone Conventional Commit and can be reverted independently in reverse order.
- No persisted schema is introduced, so this pre-1.0 change needs no compatibility reader or migration.

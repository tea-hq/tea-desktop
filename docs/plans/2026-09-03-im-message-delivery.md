# IM Message Delivery And Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every outgoing IM message a provider-neutral sending, progress, cancellation, failure, and retry workflow without exposing Yunxin SDK state above the transport adapter.

**Architecture:** The channel store owns an ephemeral `OutgoingMessageAttempt` projection keyed by a stable Tea idempotency key. Each transport call receives that key and a per-call operation id; confirmed provider messages carry a bounded Tea correlation field so normal message events can reconcile uncertain sends. Attachment picker handles stay valid across retryable failures and are released only after confirmed success, explicit dismissal, account teardown, or disposal.

**Tech Stack:** Electron main, TypeScript, Vue 3, Pinia, context-isolated IPC, Yunxin V2 SDK adapter, Vitest, Vue Test Utils.

---

## Problem And Invariants

- `sendingMessage` and `sendingProgress` are global composer flags. They cannot represent concurrent text/media sends, associate a failure with a row, or support independent retry.
- Yunxin `sendingState` is adapter evidence only. Tea owns the stable statuses `sending`, `failed`, and `cancelled`; a provider-confirmed `Message` represents the sent state.
- An outgoing attempt is a renderer projection, never durable provider truth. It retains content, mention metadata, a reply snapshot, operation identity, progress, stable error code, retryability, and attempt count.
- A retry reuses the same idempotency key and content but receives a fresh cancellable operation id. It must not create a second visible failed row.
- Provider `message.upserted` events carrying the same Tea client reference reconcile and remove an uncertain attempt even if the original promise rejected or completed late.
- Components render attempts and emit `retry`, `cancel`, and `dismiss` intent. The store owns all async state transitions and stale-lifecycle rejection.
- Attachment handles belong to the provider-neutral picker boundary, not Yunxin. Retryable failures retain them. Confirmed success, explicit dismissal, channel-account teardown, and disposal release them idempotently.
- A non-retryable failure remains visible until dismissed. Cancellation retains retry context because the provider may not support hard upload abortion; a later confirmed message always wins.
- Disconnect, account replacement, kicked-offline, and disposal remove attempts and release retained handles. Late operations cannot repopulate a new account.
- User-facing delivery copy is localized in English and Chinese. The timeline remains dense, unframed, keyboard accessible, and usable at 390 px.

### Task 1: Define Provider-Neutral Delivery Contracts

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/contracts.test.ts`

**Step 1: Write failing contract assertions**

Cover the outgoing attempt identity, statuses, reply snapshot, retry metadata, and optional confirmed-message client reference without importing Yunxin types.

**Step 2: Add stable types**

Add `OutgoingMessageStatus`, `OutgoingMessageAttempt`, and `Message.clientReference`. Extend `ChannelAttachmentPicker` with idempotent `release(token)` ownership.

**Step 3: Run the contract test**

Run: `npm run test:run -- src/features/channels/contracts.test.ts`

### Task 2: Move Attachment Lifetime To The Picker Port

**Files:**

- Modify: `electron/services/channelAttachments.ts`
- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/infrastructure/channels/electronChannelAttachmentPicker.ts`
- Modify: `src/infrastructure/channels/browserChannelAttachmentPicker.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Test: `electron/services/channelAttachments.test.ts`
- Test: `electron/ipc/channelCommands.test.ts`
- Test: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

**Step 1: Write failing lifetime tests**

Assert that a failed provider send does not release a handle, explicit picker release crosses only the allowlisted IPC command, and release remains idempotent.

**Step 2: Extend the boundary**

Add `release_channel_attachment`. Main validates one bounded token and delegates to the attachment service. Browser preview implements a no-op release.

**Step 3: Remove adapter-owned release**

The Yunxin adapter resolves handles to create SDK messages but never decides their final lifetime.

**Step 4: Run boundary tests**

Run: `npm run test:run -- electron/services/channelAttachments.test.ts electron/ipc/channelCommands.test.ts src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

### Task 3: Correlate Provider Messages And Normalize Send Errors

**Files:**

- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Test: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`
- Test: `src/infrastructure/channels/yunxinMapper.test.ts`
- Test: `src/infrastructure/channels/contractTests.ts`

**Step 1: Write failing correlation tests**

Assert that the stable request idempotency key is encoded under a Tea-owned extension field, mapped back to `Message.clientReference`, and preserved alongside mentions and caller extension data.

**Step 2: Implement bounded correlation**

Merge the key into the existing JSON server extension inside the Yunxin adapter. Keep the mapper structural so a future N-API adapter can produce the same domain field.

**Step 3: Normalize provider failures**

Pass existing `ChannelTransportError` values through and map unknown SDK send failures to stable retryable `transport` errors. Do not expose numeric provider codes.

**Step 4: Run adapter tests**

Run: `npm run test:run -- src/infrastructure/channels/YunxinWebChannelTransport.test.ts src/infrastructure/channels/yunxinMapper.test.ts src/infrastructure/channels/contractTests.ts`

### Task 4: Make The Store The Delivery Workflow Owner

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Step 1: Write failing deterministic store tests**

Cover optimistic attempt creation, concurrent sends, progress routing, success cleanup, retry with stable idempotency and fresh operation ids, non-retryable failures, cancellation, event reconciliation, attachment retention/release, account teardown, disposal, and stale completions.

**Step 2: Replace global send state**

Store attempts in a map and expose active-channel attempts plus computed sending state. `sendContent` creates an attempt before awaiting transport and calls one internal execution function for initial sends and retries.

**Step 3: Add explicit actions**

Add `retryOutgoingMessage`, `cancelOutgoingMessage`, and `dismissOutgoingMessage`. Route progress by operation id and reconcile message events by client reference.

**Step 4: Integrate lifecycle cleanup**

Cancel or invalidate active operations, release retained media handles, and clear attempts before an account/workspace boundary is discarded. Ignore all stale completions.

**Step 5: Run store tests**

Run: `npm run test:run -- src/features/channels/store.test.ts`

### Task 5: Add Slack-Style Delivery Rows And Composer Handoff

**Files:**

- Create: `src/features/channels/components/ChannelOutgoingMessageItem.vue`
- Create: `src/features/channels/components/ChannelOutgoingMessageItem.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/app/E2eFixtureApp.vue`

**Step 1: Write failing component tests**

Cover sending/progress, retryable and terminal failure, cancellation, accessible icon labels, long attachment names, and retry/cancel/dismiss events.

**Step 2: Render attempts as timeline rows**

Use a restrained right-aligned row with the same content hierarchy as sent messages. Show inline status and compact actions without message menus, receipts, reactions, or nested cards.

**Step 3: Transfer composer ownership**

Start all text/media attempts synchronously, then clear the controlled draft, reply target, and selected attachments. Failed content remains owned by its visible attempt. Multiple sends progress independently.

**Step 4: Add locale parity and fixture state**

Provide English and Chinese labels for sending, progress, failed, cancelled, retry, cancel, and dismiss. Add synthetic fixture attempts for visual verification.

**Step 5: Run component tests**

Run: `npm run test:run -- src/features/channels/components/ChannelOutgoingMessageItem.test.ts src/features/channels/components/ChannelTimeline.test.ts src/app/components/ChannelWorkspace.test.ts`

### Task 6: Document, Verify, And Commit In Phases

**Files:**

- Create: `docs/adr/0041-provider-neutral-im-message-delivery.md`

**Step 1: Record the decision**

Document source of truth, state ownership, correlation limits, cancellation semantics, error mapping, attachment lifetime, provider replacement, restart behavior, and rollback/recovery.

**Step 2: Run full checks**

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

Check desktop and 390 px English/Chinese sending, upload progress, failed, cancelled, long media name, keyboard focus, reduced motion, and horizontal overflow states.

**Step 4: Commit cohesive phases**

Commit the plan, production behavior, tests/fixtures, and ADR separately with Conventional Commit subjects and `Model: gpt-5`. Exclude `graphify-out/`. Do not push or open a PR.

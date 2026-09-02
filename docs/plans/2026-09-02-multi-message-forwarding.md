# Multi-Message Forwarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add complete message multi-selection, individual forwarding, interoperable merged forwarding, and nested merged-history viewing.

**Architecture:** The channel feature owns provider-neutral selection and forwarding contracts. Mock and Yunxin transports enforce the same limits and content rules, while only the Yunxin adapter knows its serialized message archive, custom type `101`, upload API, and remote archive format. Electron main executes provider work; the renderer store rejects stale lifecycle results and Vue components only render state or emit intent.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Electron context-isolated IPC, Yunxin V2 Web SDK, Playwright fixture.

---

## Problem And Invariants

- Users can select up to 100 messages from one channel and forward them to up to 50 channels.
- Individual mode accepts text, image, file, and video messages and creates one provider message per source/target pair.
- Merged mode accepts text, image, file, audio, video, call, and merged messages whose resulting nesting depth is at most 3.
- A merged card is a provider-neutral `MessageContent` variant. Its archive URL, checksum, source title, abstracts, and depth are facts supplied by the transport, never parsed by Vue components.
- Yunxin archives remain compatible with the reference UI Kit: line one is metadata and later lines come from `V2NIMMessageConverter.messageSerialization`; the card is custom type `101`.
- Optional comments are separate text messages after the forwarded content.
- Direct targets still pass Tea Center contact validation and automatic friendship creation before any send.
- Failed forwarding preserves selection and dialog state for retry. Switching channel or transport lifecycle clears stale ephemeral state. Failed merged-history loading is isolated to the viewer.

## Task 1: Contracts, Rules, And Mapping

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Create: `src/features/channels/messageForwarding.ts`
- Test: `src/features/channels/messageForwarding.test.ts`
- Modify: `src/features/channels/messageContent.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Test: `src/infrastructure/channels/yunxinMapper.test.ts`

1. Add `ForwardMessageMode`, merged-card metadata, `messageRefs`, `sourceChannelName`, optional `comment`, and `loadMergedMessages` to the stable transport port.
2. Add pure rules for selection limit, individual/merged eligibility, and resulting depth.
3. Add a `merged` content projection and map bounded Yunxin type-101 payloads without exposing raw provider objects.
4. Write failing rule/mapper tests, implement, then run the focused tests.

## Task 2: Transport Implementations

**Files:**

- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Test: `src/infrastructure/channels/MockChannelTransport.test.ts`
- Create: `src/infrastructure/channels/yunxinMergedMessages.ts`
- Test: `src/infrastructure/channels/yunxinMergedMessages.test.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Test: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`
- Modify: `src/infrastructure/channels/contractTests.ts`

1. Test and implement deterministic Mock individual/merged forwarding, nested depth validation, comments, snapshots, and archive loading.
2. Add a bounded type-101 payload codec and UTF-8 MD5 helper for exact reference interoperability.
3. Serialize raw Yunxin messages with the SDK converter, upload `mergedMsgs.txt`, send type-101 custom cards, and deserialize fetched archives through the converter.
4. Inject the archive loader in tests; validate HTTPS, timeout/size errors, missing messages, unsupported types, and depth overflow with stable errors.
5. Remember deserialized raw messages so nested merged cards can load and saved/archive messages can be re-forwarded.

## Task 3: Electron And Store Boundaries

**Files:**

- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Test: `src/infrastructure/channels/ElectronChannelTransport.test.ts`
- Modify: `src/features/channels/store.ts`
- Test: `src/features/channels/store.test.ts`

1. Add the allowlisted `load_merged_channel_messages` command through main, preload types, and renderer client.
2. Replace the pre-1.0 single-message store action with a request-based multi-message action.
3. Add merged-view loading/error state keyed by card reference and lifecycle generation.
4. Test command shape, stale result rejection, retry behavior, and projection of archive messages.

## Task 4: Selection And Forwarding UI

**Files:**

- Create: `src/features/channels/useChannelMessageSelection.ts`
- Test: `src/features/channels/useChannelMessageSelection.test.ts`
- Modify: `src/features/channels/components/ChannelMessageActions.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelForwardDialog.vue`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

1. Implement an independent selection use case with select-all-visible, deterministic ordering, mode eligibility, 100-message enforcement, and channel-change reset.
2. Add a message-menu Select command, timeline checkboxes, and a stable bottom action bar with count, cancel, individual, and merged commands.
3. Extend the forwarding dialog with mode, source summary, target selection, optional comment, disabled reasons, and pending state.
4. Keep saved-message single forwarding on the same request contract.
5. Add all user-facing copy to both locale files and test keyboard/disabled/empty behavior.

## Task 5: Merged Card And History Viewer

**Files:**

- Create: `src/features/channels/components/ChannelMergedMessageCard.vue`
- Create: `src/features/channels/components/ChannelMergedMessagesDialog.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Test: `src/features/channels/components/ChannelMergedMessagesDialog.test.ts`

1. Render the source title, up to three bounded abstracts, and a chat-history footer.
2. Open a dialog through store intent; render loading, error/retry, empty, and loaded archive states.
3. Reuse message content rendering for nested records while keeping message actions disabled inside the archive.
4. Verify nested cards can open until the adapter-enforced depth limit.

## Task 6: Decision Record And Verification

**Files:**

- Create: `docs/adr/0039-provider-neutral-multi-message-forwarding.md`
- Modify: `src/app/E2eFixtureApp.vue`

1. Record ownership, Yunxin archive compatibility, future N-API replacement, limits, failure semantics, and rollback/recovery.
2. Add deterministic desktop and 390px English/Chinese fixture states for selection, forwarding, merged card, loading, and error.
3. Run focused tests after every task, then `npm run test:run`, `npm run type-check`, `npm run format:check`, `npm run lint`, `node scripts/check-ui-boundaries.mjs --enforce`, `npm run build:web`, `npm run build:runner`, and `git diff --check`.
4. Review the final worktree diff. Do not commit, push, or create a PR.

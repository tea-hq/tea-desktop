# Conversation Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add provider-neutral pin, mute, and hide controls to Tea IM conversations with a dense Slack-style row menu.

**Architecture:** The channels domain owns explicit conversation-control semantics while the Yunxin adapter translates them to SDK operations. Pin and mute are authoritative provider facts projected through channel change events; hide removes a conversation from the list without clearing message history, allowing future activity to surface it again.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron typed IPC, Yunxin V2 SDK, Vitest

---

## Problem And Invariants

Enterprise users need to organize noisy conversation lists without learning
provider terminology. UIKit is evidence for SDK calls only; Tea owns the
interaction model.

- `Channel` exposes `pinned` and `muted`, never Yunxin `stickTop` or numeric mute modes.
- Each mutation is an explicit operation so partial multi-field updates cannot occur.
- `hideChannel` preserves provider message history and is not group deletion or Slack channel archival.
- Renderer components emit intent only. Store actions own pending/error state and optimistic projection after confirmed provider success.
- Yunxin remains authoritative. Normal conversation change/create events reconcile optimistic state.
- Stable `ChannelTransportError` codes cross main/preload/client boundaries.

## Task 1: Domain Contract And Projection

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Test: `src/infrastructure/channels/yunxinMapper.test.ts`

**Step 1: Write the failing mapper test**

Assert that a Yunxin conversation with `stickTop: true` and `mute: true` maps
to `{ pinned: true, muted: true }`.

**Step 2: Run the focused test**

Run: `npm run test:run -- src/infrastructure/channels/yunxinMapper.test.ts`

Expected: failure because the domain fields do not exist.

**Step 3: Add stable contracts**

Add required `pinned` and `muted` fields to `Channel`; add capabilities
`channel.pin`, `channel.mute`, and `channel.hide`; add transport methods:

```ts
setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void>
setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void>
hideChannel(channelRef: ChannelRef): Promise<void>
```

Map Yunxin `stickTop` and `mute` only inside `yunxinMapper.ts`.

**Step 4: Run mapper and type checks**

Run: `npm run test:run -- src/infrastructure/channels/yunxinMapper.test.ts`

Expected: pass after all synthetic `Channel` fixtures receive explicit values.

## Task 2: Provider, Main, And Typed IPC Boundaries

**Files:**

- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `src/types/electronBridge.ts`
- Test: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`
- Test: `src/infrastructure/channels/ElectronChannelTransport.test.ts`
- Test: `electron/ipc/channelCommands.test.ts`

**Step 1: Write failing adapter and boundary tests**

Cover exact SDK calls, direct/group mute branching, invalid conversation
types, history-preserving hide, command delegation, and stable error mapping.

**Step 2: Implement Yunxin translation**

Use:

```ts
sdk.V2NIMConversationService.stickTopConversation(channelRef, pinned)
sdk.V2NIMSettingService.setP2PMessageMuteMode(accountId, muted ? 1 : 0)
sdk.V2NIMSettingService.setTeamMessageMuteMode(teamId, 1, muted ? 1 : 0)
sdk.V2NIMConversationService.deleteConversation(channelRef, false)
```

Validate the conversation id/type before mutation. Refresh and emit the
provider conversation after pin/mute so callers need not depend on event timing.

**Step 3: Extend main and IPC**

Add allowlisted commands `set_channel_pinned`, `set_channel_muted`, and
`hide_channel`. Main handlers validate primitive fields before delegation.

**Step 4: Run focused boundary tests**

Run: `npm run test:run -- src/infrastructure/channels/YunxinWebChannelTransport.test.ts src/infrastructure/channels/ElectronChannelTransport.test.ts electron/ipc/channelCommands.test.ts`

Expected: pass.

## Task 3: Store And Slack-Style Conversation Menu

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Test: `src/features/channels/store.test.ts`
- Test: `src/features/channels/components/ChannelSidebar.test.ts`

**Step 1: Write failing store and component tests**

Cover pinned-first stable sorting, confirmed updates, failed mutation recovery,
active hidden conversation clearing, accessible menu labels, and action emits.

**Step 2: Implement store ownership**

Expose pending conversation refs and explicit store actions. After a provider
operation resolves, update the projected channel or remove it. Leave the
current projection unchanged on failure and preserve the stable error code.

**Step 3: Implement the row menu**

Use `TeaIconMenu` and MDI icons. Show pin/unpin, mute/unmute, mark read when
applicable, and hide. Keep muted/unread/pinned indicators scannable without
changing row height or exposing provider names.

**Step 4: Wire app use cases**

`ChannelWorkspace.vue` delegates row intents to store actions and does not
contain provider branching.

**Step 5: Run focused tests**

Run: `npm run test:run -- src/features/channels/store.test.ts src/features/channels/components/ChannelSidebar.test.ts`

Expected: pass.

## Task 4: Verify And Commit In Phases

**Step 1: Run default verification**

Run type check, all unit tests, format check, lint, UI boundary check, web
build, and runner build. Record pre-existing warnings separately.

**Step 2: Inspect desktop and 390 px layouts**

Verify English and Chinese menus, long channel names, pinned/muted/unread
states, keyboard focus, disabled pending state, and no horizontal overflow.

**Step 3: Commit cohesive phases**

Commit domain/runtime implementation, tests, and design documentation as
separate Conventional Commits with the required model trailer. Do not push or
open a PR.

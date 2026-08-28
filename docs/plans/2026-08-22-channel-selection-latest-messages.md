# Channel Selection And Latest Messages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the channel workspace unselected after login and reliably show the latest loaded messages at the bottom after an explicit channel selection.

**Architecture:** The channels store loads only the channel catalog during connect and preserves an explicit selection only while that channel still exists. `App.vue` distinguishes connection, empty-catalog, and connected-unselected presentation. `ChannelTimeline` owns ephemeral scroll intent: initial channel content moves to the bottom, realtime messages follow only when appropriate, and prepended history preserves the reader's viewport.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Vue I18n, `nim-web-sdk-ng` 10.9.81.

**Status:** Completed and verified on 2026-08-22.

---

## Invariants

- Login and catalog refresh do not invent a channel selection.
- Only explicit user intent or Agent-task navigation selects a channel.
- Reconnect refresh preserves a still-valid explicit selection.
- Initial history continues to query Yunxin with descending direction and is sorted oldest-to-newest in the UI projection.
- Initial content paints at the bottom after DOM layout completes.
- Prepending older history preserves the visible message position.
- Realtime messages scroll only when the reader is near the bottom or the message was sent by the current user.

## Task 1: Remove implicit channel selection

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

Write a failing store test proving connect loads channels without selecting one or requesting messages. Replace the implicit first-channel fallback with validation of an existing explicit selection.

## Task 2: Render the connected-unselected state

**Files:**

- Create: `src/features/channels/components/ChannelSelectionPlaceholder.vue`
- Modify: `src/App.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

Render a flat, quiet workspace placeholder when connected channels exist but none is selected. Continue to use `ChannelConnectionPanel` for connection states and a genuinely empty catalog.

## Task 3: Make scroll intent explicit

**Files:**

- Create: `src/features/channels/components/channelTimelineScroll.ts`
- Create: `src/features/channels/components/channelTimelineScroll.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`

Keep an initial-scroll flag per active channel. Position the first non-empty message projection at the bottom after `nextTick`. Capture height/top before requesting older messages and restore the viewport with the resulting height delta. Preserve the existing near-bottom realtime policy.

## Task 4: Verification

Run:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Browser acceptance:

1. Initial connected preview shows the channel catalog and selection placeholder with no highlighted channel.
2. Clicking a channel loads messages and places the newest message at the bottom.
3. Loading older messages does not jump away from the previously visible message.
4. Switching channels positions each newly selected timeline at its latest message.

Do not commit or push without a separate explicit instruction.

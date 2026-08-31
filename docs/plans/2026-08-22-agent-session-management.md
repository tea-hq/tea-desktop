# Agent Session Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add safe UI management for Channel-bound Agent sessions, including rename and archive actions.

**Architecture:** Reuse the existing `ConversationClient` rename/archive/delete ports and keep session facts in the conversation catalog. The collaboration store owns selection cleanup and list projection; the chooser and Agent workspace render session actions. Permanent deletion is delegated to the runtime and only removes the catalog row after canonical Agent deletion succeeds.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron IPC, vue-i18n, Vitest.

---

### Task 1: Add collaboration-store management actions

**Files:**

- Modify: `src/features/collaboration/store.ts`
- Test: `src/features/collaboration/store.test.ts`

Add typed `renameConversation` and `archiveConversation` actions. Rename updates the normalized summary through the existing conversation update stream. Archive removes the summary from the active Channel projection and clears the active selection when needed.

### Task 2: Add chooser management controls

**Files:**

- Modify: `src/features/collaboration/components/ChannelConversationChooser.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

Add per-session rename and archive controls. Rename uses an inline input with save/cancel actions. Archive requires confirmation and closes the chooser after success. Keep controls icon-only with accessible labels and tooltips.

### Task 3: Wire actions and verify

**Files:**

- Modify: `src/features/collaboration/components/ChannelConversationPanel.vue`
- Modify: `src/App.vue`

Pass management events from chooser through the panel to the collaboration store. Verify active-session cleanup and error behavior with frontend tests and type/build checks.

Verification:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

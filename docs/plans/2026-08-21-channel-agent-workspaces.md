# Channel And Agent Workspaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and validate the dual-workspace frontend using mock channel data while preserving the existing runtime-backed Agent conversation experience.

**Architecture:** A narrow workspace rail switches between `channels`, `agent`, and `settings`. The channel workspace uses mock feature contracts and a local store; an anchored message creates a shared mock `AgentTask` whose status and `Draft` are rendered in the contextual right sidebar. The Agent workspace continues to use the existing `ConversationClient` and conversation store, so no channel provider or `ChannelTransport` implementation is introduced in this scope.

**Tech Stack:** Vue 3, TypeScript, Pinia, vue-i18n, Tailwind CSS, Vitest, Vue Test Utils.

---

### Task 1: Define mock channel and task state

Files:

- Create `src/features/channels/contracts.ts`
- Create `src/features/channels/mockData.ts`
- Create `src/features/channels/store.ts`
- Create `src/features/channels/store.test.ts`

Add typed channel, participant, message, task, activity, and draft projections. Test channel selection, task creation from one anchor, task reuse, draft editing, approval, rejection, and the mapping from active channel to active task.

### Task 2: Build workspace navigation and channel list

Files:

- Create `src/app/components/WorkspaceRail.vue`
- Create `src/features/channels/components/ChannelSidebar.vue`

Provide icon-only top-level navigation with localized tooltips, stable dimensions, active state, unread indicators, search, and dense channel rows. The rail owns no application state and emits only user intent.

### Task 3: Build the channel timeline and task launcher

Files:

- Create `src/features/channels/components/ChannelTimeline.vue`
- Create `src/features/channels/components/ChannelMessageItem.vue`
- Create `src/features/channels/components/AgentTaskLauncher.vue`

Render mock P2P/group messages with sender, timestamp, reply context, reactions, and a hover action. The action opens a compact anchored task menu; it must not inject a synthetic message into the timeline.

### Task 4: Build contextual Agent collaboration

Files:

- Replace `src/features/conversation/components/DetailPanel.vue` with a mode-aware panel or add `src/features/agentTasks/components/AgentCollaborationPanel.vue`

Render quiet empty state, working activity, context range, source references, editable draft, reject/regenerate, and explicit approval. Keep task state separate from provider-owned message state.

### Task 5: Compose both workspaces

Files:

- Modify `src/App.vue`
- Reuse `src/features/conversation/components/ConversationSidebar.vue`
- Reuse `src/features/conversation/components/MessageList.vue`
- Reuse `src/features/conversation/components/MessageInput.vue`

Channels mode shows channel list, timeline, composer, and collaboration panel. Agent mode shows the existing runtime-backed conversation list, conversation canvas, composer, and a contextual source/activity panel. Settings remains a top-level workspace.

### Task 6: Localize and verify

Files:

- Modify `src/locales/en.ts`
- Modify `src/locales/zh-CN.ts`
- Verify `src/locales/locales.test.ts`

Run:

```bash
pnpm test:run
pnpm type-check
pnpm build
```

Start Vite and visually verify the channel workspace, task launcher, task activity, draft review, Agent workspace, settings, panel toggles, and narrow-window behavior. Do not implement or register `ChannelTransport` in this plan.

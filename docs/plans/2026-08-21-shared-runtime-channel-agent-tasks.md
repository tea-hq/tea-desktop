# Shared Runtime Channel Agent Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace placeholder Channel task drafts with real Agent execution through the existing Tea, Claude Code, and Codex conversation runtime boundary.

**Architecture:** The channels use case loads and sanitizes bounded context through `ChannelTransport`, then delegates execution to a typed `AgentTaskClient` backed by `ConversationClient`. Standard runtime events reduce into the existing `AgentTask` and `Draft` projection; explicit approval remains the only path back to the Channel provider.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Tauri 2, Rust, existing `ConversationRuntime` adapters.

---

## Invariants

- Components never call `ConversationClient`, Tauri IPC, or `ChannelTransport`.
- The channels store never branches on `builtin.tea`, `external.claude`, or `external.codex`.
- Runtime descriptors and capabilities determine task availability.
- One `MessageRef` anchors a task; context count and total prompt bytes are bounded.
- Runtime events are authoritative for working, completed, cancelled, and failed execution.
- Agent output becomes a Draft; only human approval calls `ChannelTransport.sendMessage`.
- Provider credentials, SDK DTOs, extensions, receipts, and attachments never enter Agent input.

### Task 1: Record the execution architecture

**Files:**

- Create: `docs/adr/0009-shared-runtime-channel-agent-tasks.md`
- Create: `docs/plans/2026-08-21-shared-runtime-channel-agent-tasks.md`
- Modify: `docs/plans/2026-08-21-channel-transport-agent-bridge.md`

Mark the earlier Channel transport plan as completing context anchoring and
human approval only. Link this plan for real runtime execution.

### Task 2: Define and test bounded task execution contracts

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Create: `src/features/channels/agentTaskPrompt.ts`
- Create: `src/features/channels/agentTaskPrompt.test.ts`
- Create: `src/features/channels/agentTaskClient.ts`
- Create: `src/features/channels/agentTaskClient.test.ts`

Add serializable task start requests, execution handles, task events, and the
`AgentTaskClient` port. Build a deterministic prompt from sanitized messages,
with limits for message count, per-message text, total text, and instruction.
Test all three ready runtime descriptors through one contract suite, duplicate
event sequences, cancellation, runtime failure, and empty output.

### Task 3: Implement the ConversationClient adapter

**Files:**

- Create: `src/infrastructure/channels/ConversationAgentTaskClient.ts`
- Create: `src/infrastructure/channels/ConversationAgentTaskClient.test.ts`
- Modify: `src/infrastructure/conversation/tauriConversationClient.ts`

Create a conversation for the selected runtime, subscribe before sending, use
read-only permission mode, and translate standard conversation events without
runtime-name branches. Browser preview emits deterministic real-shaped events.

### Task 4: Classify task conversations

**Files:**

- Modify: `src/features/conversation/contracts.ts`
- Modify: `src-tauri/src/conversation/commands.rs`
- Modify: `src/infrastructure/conversation/tauriConversationClient.ts`
- Modify affected TypeScript and Rust tests

Add `interactive | channelTask` purpose to conversation creation. Ordinary
sessions retain the existing catalog behavior; first-phase task sessions stay
process-local and return no catalog summary. Runtime implementations stay
unchanged.

### Task 5: Replace placeholder store execution

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`
- Modify: `src/App.vue`

Configure both ports, load bounded context, create a working task, start the
runtime, and reduce ordered task events into activities and Draft content.
Implement cancellation and true regeneration through the runtime. Preserve the
existing approval idempotency and provider identity envelope.

### Task 6: Add runtime selection and truthful UI states

**Files:**

- Modify: `src/features/channels/components/AgentTaskLauncher.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/AgentCollaborationPanel.vue`
- Modify: `src/features/channels/components/AgentTaskConversation.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

Show ready runtimes with prompt/events capability in the compact launcher,
default to the configured runtime, render working/failed/cancelled states, and
display the selected runtime by descriptor label. Do not hardcode runtime names.

### Task 7: Verify the vertical slice

Run:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Manually verify browser mock execution and Tauri execution with each available
runtime: working activity, streamed Draft, failure, cancellation, regeneration,
human edit, approval, and exactly one Channel send.

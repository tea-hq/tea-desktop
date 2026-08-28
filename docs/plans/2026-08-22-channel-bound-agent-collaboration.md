# Channel-Bound Agent Collaboration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace process-local one-shot Channel Agent tasks with durable,
multi-turn Agent conversations bound to one Channel, with staged sources,
bounded history tools, explicit Draft creation, and idempotent reviewed
delivery.

**Architecture:** The Tauri conversation host owns durable Conversation
bindings, source snapshots, Draft versions, and Delivery records. A frontend
collaboration use case coordinates the typed `ConversationClient` and
`ChannelTransport`; Conversation runtimes remain product-neutral and
`ChannelTransport` remains authoritative for messages. The Channel side panel
and Agent workspace render the same Conversation projection.

**Tech Stack:** Tauri 2, Rust, rusqlite, Vue 3, TypeScript, Pinia, Vitest,
vue-i18n, `nim-web-sdk-ng` 10.9.81.

---

No commit or push is part of this plan without a separate explicit request.

### Task 1: Version The Durable Conversation Domain

**Files:**

- Modify: `src-tauri/src/conversation/catalog.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Test: `src-tauri/src/conversation/catalog.rs`

**Steps:**

1. Add failing catalog tests for immutable `ChannelBinding`, all/local/channel/
   exact-binding keyset pagination, schema upgrade, and account-scope
   separation.
2. Run `cargo test --manifest-path src-tauri/Cargo.toml conversation::catalog`;
   expect the new tests to fail on missing types and filters.
3. Replace the v1 bootstrap with a transactional versioned schema. Back up an
   existing database before the first migration.
4. Add nullable binding fields to `ConversationRecord` and
   `ConversationSummary`, validated as bounded opaque ids.
5. Add indexed backend filtering to `ListConversationsRequest` without
   frontend post-filtering.
6. Run the focused catalog tests; expect all to pass.

### Task 2: Persist Sources, Drafts, And Deliveries

**Files:**

- Create: `src-tauri/src/conversation/collaboration.rs`
- Modify: `src-tauri/src/conversation/catalog.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Test: `src-tauri/src/conversation/collaboration.rs`

**Steps:**

1. Write failing tests for bounded sanitized source input, turn-ordinal
   association, source deduplication, Draft creation/versioning, one Delivery
   per Draft version, terminal sent identity, uncertain recovery, and cascade
   deletion.
2. Add serializable `ChannelSource`, `Draft`, `DraftVersion`, `Delivery`, and
   `CollaborationSnapshot` DTOs with explicit byte/id limits.
3. Add normalized `conversation_turn_contexts`, `channel_sources`, `drafts`,
   `draft_versions`, and `deliveries` tables and indexes.
4. Implement transactional create/list/update methods in a host-owned
   repository over the catalog connection; do not expose the connection to
   commands.
5. Run focused Rust tests; expect all to pass.

### Task 3: Extend Tauri Commands And Recovery

**Files:**

- Modify: `src-tauri/src/conversation/commands.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/conversation/commands.rs`

**Steps:**

1. Add failing serialization and delegation tests for bound conversation
   creation, filtered listing, collaboration detail, source-backed send, host
   tool reconfiguration, Draft CRUD, and Delivery state transitions.
2. Remove `ConversationPurpose`; every snapshot-capable conversation is
   cataloged and optional binding determines Channel scope.
3. Extend `create_conversation` with optional binding and continue configuring
   generic host tools.
4. Extend `get_conversation` with `CollaborationSnapshot` and replace runtime
   prompt text with persisted visible instructions by turn ordinal.
5. Extend `send_message` with bounded source inputs. Load the snapshot first,
   persist the turn context at its next ordinal, build the bounded Agent prompt
   in the Desktop host, and dispatch only after persistence succeeds.
6. Add `configure_conversation_host_tools`, Draft, and Delivery commands and
   register them in `lib.rs`.
7. Preserve terminal scope cleanup so each turn receives a fresh tool quota.
8. Run focused command and full Rust conversation tests.

### Task 4: Extend Serializable Frontend Contracts

**Files:**

- Create: `src/types/channelCollaboration.ts`
- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/conversation/contracts.ts`
- Modify: `src/infrastructure/conversation/tauriConversationClient.ts`
- Modify: `src/infrastructure/conversation/tauriConversationClient.test.ts`

**Steps:**

1. Write failing adapter tests for exact invoke payloads and all new DTO
   mappings.
2. Add provider-neutral binding, source, Draft, Delivery, filter, and request
   types in `src/types/`.
3. Extend `ConversationSummary`, `ConversationDetail`,
   `ListConversationsRequest`, `CreateConversationOptions`,
   `SendMessageOptions`, and `ConversationClient`.
4. Remove `ConversationPurpose` and `channelTask` preview branching.
5. Make `FakeConversationClient` persist bound conversations, sources, turns,
   Drafts, and Deliveries through the same contract.
6. Run adapter tests and `pnpm type-check`.

### Task 5: Generalize Channel Account And History Scope

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/channelHistoryTool.ts`
- Modify: `src/infrastructure/channels/channelHistoryTool.test.ts`
- Modify: `src/infrastructure/channels/contractTests.ts`

**Steps:**

1. Add failing transport tests for stable opaque account scope and history
   loading without an anchor.
2. Add `accountRef` to connected `ChannelStatus`. Derive it from transport,
   provider application namespace, and account without persisting credentials.
3. Change `ChannelHistoryToolScope` from required task anchor to immutable
   conversation binding plus optional known refs.
4. Permit a bounded recent page when no cursor is provided; require later
   cursors to come from the same turn scope.
5. Return sanitized source inputs, not only refs, so tool evidence can be
   persisted.
6. Reset all quotas for each submitted turn and retain current failure codes.
7. Run Channel transport and history-tool contract tests.

### Task 6: Add The Collaboration Store And Use Cases

**Files:**

- Create: `src/features/collaboration/store.ts`
- Create: `src/features/collaboration/store.test.ts`
- Create: `src/features/collaboration/channelPrompt.ts`
- Create: `src/infrastructure/collaboration/ConversationCollaborationClient.ts`
- Modify: `src/features/conversation/store.ts`
- Modify: `src/features/conversation/store.test.ts`

**Steps:**

1. Write failing store tests for exact-binding history, new bound
   conversations, source staging/removal/deduplication, source-backed and local
   turns, host-tool execution, disconnect/account switch, Draft versioning,
   delivery, duplicate confirmation, and uncertain reconciliation.
2. Implement one collaboration store over injected `ConversationClient` and
   `ChannelTransport`; never call another Pinia store.
3. Keep source tray and compact/full selection ephemeral. Read all durable
   summaries and details through `ConversationClient`.
4. Subscribe to runtime events and host-tool calls for the active bound
   conversation. Configure a fresh history scope before every turn.
5. Project persisted sources onto Conversation turns by ordinal.
6. Implement two-phase Delivery: prepare, optional bounded reconciliation,
   provider send, and complete/fail.
7. Extend the ordinary conversation store only where unified filtering and
   shared selection require it; do not duplicate runtime reduction.
8. Run focused store and reducer tests.

### Task 7: Build The Compact And Full Collaboration Views

**Files:**

- Create: `src/features/collaboration/components/ChannelConversationPanel.vue`
- Create: `src/features/collaboration/components/ChannelConversationChooser.vue`
- Create: `src/features/collaboration/components/ChannelSourceTray.vue`
- Create: `src/features/collaboration/components/ChannelSourceCard.vue`
- Create: `src/features/collaboration/components/DraftEditor.vue`
- Modify: `src/features/channels/components/AgentTaskLauncher.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/conversation/components/ConversationSidebar.vue`
- Modify: `src/features/conversation/components/ConversationTurn.vue`
- Modify: `src/features/conversation/components/MessageList.vue`
- Modify: `src/features/conversation/components/MessageInput.vue`
- Modify: `src/App.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Steps:**

1. Use `$frontend-design` before editing UI files and preserve the existing
   three-column flat visual language.
2. Add component tests for chooser, staged sources, no-immediate-run behavior,
   compact/full shared selection, Draft creation, offline capabilities, and
   localized states.
3. Replace task preset execution with a same-Channel conversation chooser and
   instruction prefill.
4. Build the compact right panel with conversation switcher, history, source
   tray, composer, Draft mode, and Expand.
5. Add All/Local/Channel filters and Channel identity to the unified Agent
   catalog.
6. Add Create Channel Draft to completed assistant responses.
7. Preserve Channel selection and timeline scroll when expanding and returning.
8. Add all copy to both locale files and run locale parity tests.

### Task 8: Remove The Legacy Task State Machine

**Files:**

- Delete: `src/infrastructure/channels/ConversationAgentTaskClient.ts`
- Delete: `src/infrastructure/channels/ConversationAgentTaskClient.test.ts`
- Delete: `src/features/channels/agentTaskPrompt.ts`
- Delete: `src/features/channels/agentTaskPrompt.test.ts`
- Delete: `src/features/channels/components/AgentCollaborationPanel.vue`
- Delete: `src/features/channels/components/AgentTaskConversation.vue`
- Delete: `src/features/channels/components/AgentWorkspaceSidebar.vue`
- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Steps:**

1. Remove `AgentTask`, task client/events, process-local task arrays, and all
   duplicate Draft lifecycle methods.
2. Remove legacy component imports and mode branches.
3. Keep Channel selection, messages, sending, and projection behavior
   unchanged.
4. Use `rg` to prove no production references to the removed contracts remain.
5. Run all frontend tests and type checking.

### Task 9: Full Verification

**Steps:**

1. Run `pnpm test:run`.
2. Run `pnpm type-check`.
3. Run `pnpm build`.
4. Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` after
   formatting changed Rust files.
5. Run `cargo check --manifest-path src-tauri/Cargo.toml`.
6. Run `cargo test --manifest-path src-tauri/Cargo.toml`.
7. Start the local development server and visually verify desktop and narrow
   viewports with browser screenshots.
8. Exercise browser fallback and real Yunxin flows: multiple conversations per
   Channel, restart recovery, source-free query, staged references, multi-turn
   continuation, Draft delivery, duplicate confirmation, disconnect, account
   switch, revoke, modify, and delete.
9. Run `git diff --check` and audit the final status. Leave `.codegraph/` and
   `src-tauri/.temp` untouched and untracked.

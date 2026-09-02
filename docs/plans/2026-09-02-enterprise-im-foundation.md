# Enterprise IM Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a provider-neutral enterprise IM foundation that supports the full UIKit feature set and keeps Yunxin SDK details replaceable by a future N-API adapter.

**Architecture:** Tea-owned contracts model messages, contacts, mutations, media, and Agent provenance. Electron main owns provider objects and credentials; the renderer consumes typed ports and replayable projections. Tea Center remains authoritative for enterprise contacts and Yunxin remains authoritative for IM conversations, groups, and members.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron IPC, `nim-web-sdk-ng`, Vitest, Playwright.

---

### Task 1: Define the provider-neutral message foundation

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/projection.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Test: `src/infrastructure/channels/yunxinMapper.test.ts`
- Test: `src/features/channels/projection.test.ts`

**Steps:**

1. Add a discriminated `MessageContent` union with bounded attachment, reply, mention, and unknown-message metadata.
2. Replace the experimental text-only message shape directly; add pure helpers for display text and message identity without importing Yunxin types.
3. Map text and unknown Yunxin messages through the adapter, keeping provider enums and raw DTOs inside the adapter.
4. Update the mock transport and projection fixtures to use the new contract.
5. Run the mapper and projection tests and add coverage for unknown, oversized, and malformed provider content.

### Task 2: Add typed message mutation ports and event capability separation

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Test: corresponding transport and IPC contract tests

**Steps:**

1. Add typed commands for revoke, delete, reply, quick reaction, pin, collection, and forwarding.
2. Add capability IDs for commands separately from notification/event capabilities.
3. Validate message references, content sizes, target channels, and idempotency keys at the main boundary.
4. Map provider errors to stable retryable/non-retryable Tea errors.
5. Verify duplicate commands, cancellation, late events, and account changes.

### Task 3: Close the renderer action loop

**Files:**

- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/store.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Test: channel component and store tests

**Steps:**

1. Forward message-scoped actions from item to timeline and store use cases.
2. Gate actions by provider capabilities and render explicit pending/failure states.
3. Implement reply composer state and delete/revoke confirmation.
4. Add UI tests proving actions reach the store boundary rather than being dropped.

### Task 4: Implement Center contact and Yunxin friendship orchestration

**Files:**

- Modify: `src/features/directory/contracts.ts`
- Modify: `src/infrastructure/directory/electronDirectoryClient.ts`
- Modify: `electron/services/centerAuth.ts`
- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/app/useWorkspaceActions.ts`
- Test: directory, channel, and workspace action tests

**Steps:**

1. Add a typed contact lookup and idempotent `ensureFriend` operation.
2. Validate every P2P target against Center before opening a Yunxin conversation.
3. Reject ordinary Yunxin participants that cannot resolve to Center identity; model system/robot principals explicitly.
4. Add synchronization diagnostics and recovery for temporary Center/Yunxin divergence.

### Task 5: Add reliable history, media, forwarding, and Agent integration

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/features/collaboration/*`
- Modify: `src/features/conversation/*`
- Modify: `electron/conversation/*`
- Add: focused ADR and OpenSpec documents
- Test: transport, store, Agent, and end-to-end tests

**Steps:**

1. Add latest/anchor/after pagination, new-message indicators, and send reconciliation.
2. Add image/file/video/audio transfer with progress, cancellation, and secure references.
3. Implement normal forwarding, Agent forwarding, multi-select, merged forwarding, pin, collection, and search.
4. Connect the same message source contract to local and cloud Agent runtimes.
5. Implement group/member management, presence, voice-to-text, and long-tail message types.
6. Run the full deterministic verification suite and update the architecture ADR to reflect the full target scope.

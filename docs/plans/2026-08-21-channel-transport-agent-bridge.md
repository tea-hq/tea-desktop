# Real Channel Integration Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the channel workspace's fixture-backed state with a real, bounded Yunxin channel transport while preserving provider-neutral store, component, `AgentTask`, and `Draft` contracts.

**Architecture:** Vue components emit intent to the channels Pinia store. The store owns a normalized, replayable projection over the typed `ChannelTransport` port; `YunxinWebChannelTransport` is the only module allowed to hold SDK objects, while `MockChannelTransport` implements the same contract for browser preview and tests. Tauri owns credential persistence, and the WebView receives a token only for an explicit login attempt.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, `nim-web-sdk-ng` 10.9.81, Tauri 2, Rust `keyring`, serde.

---

## Invariants and ownership

- The provider SDK remains the authority for channel, message, read, pin, quick-comment, and receipt facts.
- The channels store is only an in-memory UI projection. It never persists SDK objects or invents provider state.
- Every transport request, result, descriptor, status, capability, and event is structured-clone/JSON serializable.
- The adapter bounds channel pages, message pages, text, extension JSON, collection sizes, and its pending event queue.
- `MessageRef` is the only Agent task anchor. Context expansion calls bounded `loadMessages`; Vue never concatenates full history into a prompt.
- A `Draft` must be explicitly approved. Approval sends one message with a versioned identity envelope and an idempotency key; retries return the recorded provider IDs rather than sending twice.
- Account switching, kicked-offline, logout, and disposal remove listeners symmetrically and clear provider and projection memory.
- Quick comments are advertised only as unsupported in phase 1 until the SDK mutation API is verified; notifications still enter the authoritative event stream when available.

## Task 1: Record the architecture decision

**Files:**

- Create: `docs/adr/0008-real-channel-transport.md`
- Modify: `docs/plans/2026-08-21-channel-transport-agent-bridge.md`

Document boundaries, credential ownership, provider event mapping, recovery, idempotency, CSP, alternatives, migration, and rollback.

## Task 2: Define provider-neutral contracts and reducers

**Files:**

- Replace: `src/features/channels/contracts.ts`
- Create: `src/features/channels/projection.ts`
- Create: `src/features/channels/projection.test.ts`

Define `ChannelRef`, `MessageRef`, `Channel`, `Message`, `Participant`, `ChannelPage`, `MessagePage`, `ChannelEvent`, `ChannelCapability`, `AgentTask`, `Draft`, and `ChannelTransport`. Test pagination merge, client/server ID deduplication, stable ordering, bounded queues, duplicate/out-of-order events, clear, delete, revoke, and modify.

## Task 3: Implement transport contract fixtures

**Files:**

- Create: `src/infrastructure/channels/MockChannelTransport.ts`
- Create: `src/infrastructure/channels/contractTests.ts`
- Create: `src/infrastructure/channels/MockChannelTransport.test.ts`
- Remove store dependency on: `src/features/channels/mockData.ts`

Use one reusable contract suite for lifecycle, pagination, real-time events, mark-read, account switching, disposal, capability failures, and serializability.

## Task 4: Implement the Yunxin web adapter

**Files:**

- Create: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Create: `src/infrastructure/channels/yunxinMapper.ts`
- Create tests beside both files
- Modify: `package.json`, `pnpm-lock.yaml`

Initialize `V2NIM.getInstance` with `needReconnect`, `apiVersion: 'v2'`, and `enableV2CloudConversation: true`. Register login, connection, sync, kicked-offline, conversation, message, pin, quick-comment-notification, and receipt listeners with symmetric `on`/`off`. Map SDK enums and objects inside the adapter only. Use `getConversationList`, `getMessageList`, `createTextMessage`, `sendMessage`, and `markConversationRead` with bounded inputs.

Normalize the SDK's bounded CommonJS/default-export wrappers inside the adapter before calling `getInstance`; Vite 8 may expose the browser SDK through a nested `default` export.

## Task 5: Add Tauri credential ownership and CSP

**Files:**

- Create: `src-tauri/src/channel_credentials.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Create: `src/infrastructure/channels/tauriChannelCredentials.ts`

Store account/token in the OS credential facility through Tauri commands. Do not log or return credentials outside explicit load-for-login. Inject app key through `VITE_YUNXIN_APP_KEY`; do not add a default. Restrict CSP network access to the SDK login/link endpoints required by the confirmed configuration.

For repeatable local provider tests, debug Tauri builds may read a complete `TEA_CHANNEL_ACCOUNT`/`TEA_CHANNEL_TOKEN` pair from git-ignored `.env.local`. Parse it in Rust and keep the token out of Vite variables and WebView bundles; production builds must ignore this fallback.

## Task 6: Replace the fixture store with a transport projection

**Files:**

- Replace: `src/features/channels/store.ts`, `src/features/channels/store.test.ts`
- Modify: `src/App.vue`

Configure exactly one transport, subscribe before connect, load channels after connection/sync, select and mark read through the transport, merge history and real-time events, recover after reconnect, reset on kicked-offline/account switch, and dispose on app teardown. Browser preview uses `MockChannelTransport`; Tauri uses `YunxinWebChannelTransport`.

## Task 7: Close channel and Agent draft UI flows

> Status note: this task completed bounded context anchoring, Draft review, and
> idempotent provider send. Real Agent execution was intentionally not part of
> that implementation and is tracked in
> `docs/plans/2026-08-21-shared-runtime-channel-agent-tasks.md`.

**Files:**

- Modify channel components without changing the three-column visual design
- Modify both locale files and locale parity tests as needed
- Add focused component/store tests

Wire channel selection, older-history loading, text send, connection/login state, and errors. Create tasks from one `MessageRef`; use bounded store context loading. Draft edit/reject remains local, while approval calls the transport exactly once and records `messageClientId`/`messageServerId` on success. Unsupported capabilities disable their commands rather than simulating state.

## Task 8: Verification

Run focused tests during each task, then:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Manual checks: browser mock preview, empty/loading/error/offline states, history prepend without scroll corruption, reconnect, kicked-offline, account switch, duplicate approval, unsupported quick comment, and app disposal.

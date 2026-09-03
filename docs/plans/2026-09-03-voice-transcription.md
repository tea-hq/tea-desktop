# Provider-Neutral Voice Transcription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users request, retry, and read bounded transcripts for Yunxin voice messages while keeping SDK parameters and transcript lifecycle out of Vue.

**Architecture:** `ChannelTransport` gains a provider-neutral message-reference transcription command. The Yunxin adapter resolves the cached raw voice message and translates its attachment into `voiceToText` parameters; Electron IPC carries only the message reference and bounded text. The channel store owns operation state, concurrent-call coalescing, lifecycle rejection, and an account-scoped in-memory cache. Components render a compact Slack-style action and inline transcript.

**Tech Stack:** Electron, Vue 3, TypeScript, Pinia, Yunxin V2, Vitest.

---

## Problem And Invariants

- UIKit is evidence for the SDK call only. Tea does not copy its component-level SDK access, tooltip flow, toast state, or H5 styling.
- The renderer command contains only a `MessageRef`. Attachment fields and SDK errors stay in the provider adapter.
- Only an active audio message already known to the transport is eligible. A missing HTTPS URL, invalid duration, wrong content type, stale message reference, or empty/unbounded provider response fails with a stable error.
- Transcripts are sensitive derived content. They are bounded to 32 KiB, account-scoped, memory-only, and never enter drafts, catalogs, storage, logs, Agent sources, or Tea Center.
- The store owns `idle`, `loading`, `ready`, and `failed`, coalesces concurrent calls, reuses success, permits retry, and rejects stale lifecycle results.
- Disconnect, kicked-offline, account replacement, disposal, message deletion, and message revocation remove affected transient state. Reconnect does not automatically retranscribe.
- The UI offers transcription only when the transport advertises `message.voice.transcribe` and the message is active audio. Loading, success, empty, failure, retry, focus, reduced motion, and narrow English/Chinese layouts remain stable.

## Alternatives Considered

- Component SDK calls expose provider lifecycle to Vue.
- Durable transcripts need retention, encryption, deletion, and sync policy.
- Transcript text on `Message` would mix a local projection with provider truth.

### Task 1: Define The Provider-Neutral Contract

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/contracts.test.ts`
- Modify: `src/infrastructure/channels/contractTests.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.test.ts`

**Step 1: Write failing contract tests**

Assert the command capability, `MessageRef` input, plain-text result, and no Yunxin imports.

**Step 2: Add stable types and mock behavior**

Add transcript state and `transcribeVoice(messageRef)`. The mock validates active audio and returns deterministic text.

**Step 3: Run focused tests**

Run: `npm run test:run -- src/features/channels/contracts.test.ts src/infrastructure/channels/MockChannelTransport.test.ts src/infrastructure/channels/contractTests.ts`

### Task 2: Translate Yunxin Voice Messages

**Files:**

- Create: `src/infrastructure/channels/yunxinVoiceTranscription.ts`
- Create: `src/infrastructure/channels/yunxinVoiceTranscription.test.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

**Step 1: Write failing adapter tests**

Cover wrong types, unsafe URLs, invalid duration, bounded/empty responses, rejection, exact parameters, and error redaction.

**Step 2: Add the pure parameter mapper**

Validate raw message type 2 and a bounded attachment. Pass `voiceUrl`, millisecond `duration`, `mimeType: 'aac'`, `sampleRate: '16000'`, and a bounded optional `sceneName` to the SDK.

**Step 3: Add the adapter command**

Resolve the cached raw message, call `voiceToText`, map stable errors, and return at most 32 KiB of trimmed text.

**Step 4: Run focused tests**

Run: `npm run test:run -- src/infrastructure/channels/yunxinVoiceTranscription.test.ts src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

### Task 3: Carry The Command Through Electron

**Files:**

- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `electron/ipc/channelCommands.test.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.test.ts`

**Step 1: Write failing boundary tests**

Assert one allowlisted command, `MessageRef` validation, delegation, bounded results, and stable errors.

**Step 2: Implement the boundary**

Main validates and delegates. Preload exposes no URL, provider object, credential, or new event channel.

**Step 3: Run boundary tests**

Run: `npm run test:run -- electron/ipc/channelCommands.test.ts src/infrastructure/channels/ElectronChannelTransport.test.ts electron/preload.test.ts`

### Task 4: Make The Store Own Transcription State

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Step 1: Write deterministic store tests**

Cover capability gating, caching, coalescing, retry, errors, deletion/revocation, lifecycle reset, disposal, and late results.

**Step 2: Add the transient projection**

Expose active-channel transcripts and `transcribeVoice`. Keep promises private and generation-scoped.

**Step 3: Run store tests**

Run: `npm run test:run -- src/features/channels/store.test.ts`

### Task 5: Render Tea Voice Transcripts

**Files:**

- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/app/E2eFixtureApp.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Step 1: Write failing component tests**

Cover eligibility, accessible command, loading, transcript, localized retry, revoked state, and other media.

**Step 2: Add the Slack-style interaction**

Place a text-recognition command beside audio and bounded text below it. Emit intent through Timeline and Workspace.

**Step 3: Add fixture states and run tests**

Add `voice-transcription-idle`, `voice-transcription-loading`, `voice-transcription-ready`, and `voice-transcription-error` fixtures.

Run: `npm run test:run -- src/features/channels/components/ChannelMessageItem.test.ts src/features/channels/components/ChannelTimeline.test.ts`

### Task 6: Document, Verify, And Commit In Phases

**Files:**

- Create: `docs/adr/0043-provider-neutral-voice-transcription.md`

**Step 1: Record the decision**

Document replacement, ownership, privacy, bounds, errors, cancellation, and non-durability.

**Step 2: Run full checks**

Run all default checks, E2E web build, runner build, and `git diff --check`.

**Step 3: Visually verify**

Check desktop and 390 px English/Chinese idle, loading, ready, failure/retry, focus, offline, and reduced-motion states. Reset temporary browser viewport overrides.

**Step 4: Commit cohesive phases**

Commit the plan, contracts/provider, Electron/store, UI/tests, and ADR separately with Conventional Commit subjects and `Model: gpt-5`. Exclude `graphify-out/`. Do not push or open a PR.

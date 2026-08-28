# Channel Identity Presentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display provider-backed channel names and avatars in the existing conversation list with resilient, provider-neutral fallbacks.

**Architecture:** `YunxinWebChannelTransport` remains the only owner of Yunxin objects and converts computed conversation identity into the serializable `Channel` DTO. Vue renders only `Channel.name` and `Channel.avatarUrl`; it does not query user, friend, or team services. Newly created group conversations with incomplete identity are refreshed once through the conversation service before being projected.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Vue Test Utils, `nim-web-sdk-ng` 10.9.81.

---

## Invariants

- `Channel` identity remains provider-neutral and serializable.
- SDK objects, conversation enums, and target-id parsing remain inside the Yunxin transport.
- Existing layout, density, selection behavior, search, and unread presentation do not change.
- Invalid, missing, or failed avatar images fall back to bounded channel initials.
- Account switching and disposal continue to clear all transport-owned state and listeners.
- Friend aliases and user-profile caches are not introduced in this change; the SDK-computed conversation name is the authoritative phase-one value.

## Task 1: Record the identity boundary

**Files:**

- Create: `docs/adr/0011-provider-neutral-channel-identity.md`
- Create: `docs/plans/2026-08-22-channel-identity-presentation.md`

Document ownership, fallbacks, group-created recovery, rejected UIKit dependencies, migration, rollback, and recovery.

## Task 2: Extend and test the channel DTO mapping

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.test.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`

Add optional `avatarUrl`, bound the provider URL, and accept the SDK-parsed target id as the name fallback. Verify serializability, avatar mapping, and the absence of raw encoded conversation ids when a target id is available.

## Task 3: Recover incomplete group identity

**Files:**

- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

Map every conversation through the SDK target-id utility. When a group-created event omits its name or avatar, fetch the current conversation once and publish the refreshed DTO; publish the original bounded fallback if refresh fails.

## Task 4: Render resilient avatars

**Files:**

- Create: `src/features/channels/components/ChannelAvatar.vue`
- Create: `src/features/channels/components/channelAvatarPresentation.ts`
- Create: `src/features/channels/components/channelAvatarPresentation.test.ts`
- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Modify: `src-tauri/tauri.conf.json`

Render real avatar URLs without changing list geometry. Use a circular crop for direct channels and a compact rounded crop for group channels. Reset image-failure state when the source changes and fall back to initials with a neutral deterministic tone. Permit images only from the confirmed Yunxin/NetEase CDN domain families in the Tauri CSP.

## Task 5: Verification

Run focused tests, then:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Verify the browser mock at desktop width for avatar geometry, failed-image fallback, truncation, selection, unread badges, and unchanged three-column layout. Do not commit or push without a separate explicit instruction.

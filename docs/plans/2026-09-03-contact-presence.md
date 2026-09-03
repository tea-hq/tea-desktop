# Provider-Neutral Contact Presence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show live online, offline, and unavailable presence for Tea Center-backed direct-message contacts without exposing Yunxin subscription types above the transport adapter.

**Architecture:** `ChannelTransport` gains a replace-set presence subscription port and emits provider-neutral presence events. The Yunxin adapter validates every requested account against the Tea Center directory, diffs and batches SDK subscriptions, renews them before expiry, and maps SDK events structurally. The channel store owns desired-target synchronization, stale lifecycle rejection, stable errors, and the renderer projection; Vue only renders status.

**Tech Stack:** Electron main, Vue 3, TypeScript, Pinia, context-isolated IPC, Yunxin V2 Subscription Service, Vitest, Vue Test Utils.

---

## Problem And Invariants

- Tea Center is the contact source of truth. Presence may only be requested for Center directory contacts already represented by synchronized direct conversations. An unknown account is a protocol bug, not a discoverable Yunxin contact.
- `statusType`, `clientType`, `serverExtension`, subscription result objects, and Yunxin event names remain inside the adapter. The renderer contract is `online`, `offline`, or `unknown` with an account id and provider timestamp.
- Presence is ephemeral. It is not persisted in the conversation catalog, draft catalog, local storage, or renderer storage. Reconnect reconstructs it from current direct conversations.
- The store owns the desired subscription set and projection. Components render presence and emit no subscription commands.
- Subscription replacement is bounded to 3,000 unique accounts and 512 characters per account. The adapter calls Yunxin in batches of at most 100.
- A replacement validates its entire requested set before mutating provider subscriptions. Partial SDK failures retain the known successful subset and surface a retryable stable error.
- Subscriptions use a bounded duration and are renewed before expiry. Disconnect, kicked-offline, account replacement, and disposal cancel renewal, clear adapter state, and prevent stale events from repopulating the next account.
- Login events map as follows: login is online; logout/disconnect is online only when structurally parsed `serverExtension.online` contains at least one client, otherwise offline; unknown is unknown; custom statuses do not overwrite availability.
- The UI follows Tea/Slack workspace patterns: a restrained status dot on direct-message avatars and the active direct-message header, no dot on group channels, localized accessible labels, stable layout at 390 px, and no provider wording.

## Alternatives Considered

- Store presence on `Channel`: rejected because a synchronized conversation catalog is durable provider truth while presence expires independently and changes at a much higher rate.
- Subscribe from Vue components: rejected because route/component churn would own transport lifecycle, duplicate subscriptions, and couple UI to provider limits.
- Subscribe to every Tea Center contact immediately: deferred until the contact directory becomes a renderer feature. Direct-conversation targets are the current bounded consumer set and are still validated against Center.
- Copy UIKit's string-length heuristic for `serverExtension`: rejected. Tea parses bounded JSON and checks the `online` array structurally.

### Task 1: Define Provider-Neutral Presence Contracts

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/contracts.test.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.ts`
- Modify: `src/infrastructure/channels/yunxinMapper.test.ts`

**Step 1: Write failing contract and mapper tests**

Assert that direct channels expose a bounded `directAccountId`, group channels do not, presence types import no Yunxin symbols, `presence.subscribe` is a capability, and the transport has replace-set subscription semantics.

**Step 2: Add stable types**

Add `ChannelPresenceAvailability`, `ChannelPresence`, `Channel.directAccountId`, `presence.changed`, `presence.subscriptionFailed`, and `setPresenceSubscriptions(accountIds)`. Map the provider target id only for direct conversations.

**Step 3: Run tests**

Run: `npm run test:run -- src/features/channels/contracts.test.ts src/infrastructure/channels/yunxinMapper.test.ts`

Expected: PASS with no provider imports in feature contracts.

### Task 2: Implement The Yunxin Presence Adapter

**Files:**

- Create: `src/infrastructure/channels/yunxinPresence.ts`
- Create: `src/infrastructure/channels/yunxinPresence.test.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/contractTests.ts`

**Step 1: Write failing mapping and lifecycle tests**

Cover structural multi-client parsing, custom-status ignore, account validation, deduplication, 100-account batching, unsubscribe-before-subscribe diffing, partial failures, immediate sync, renewal, reconnect, listener cleanup, and stale event rejection with fake timers only.

**Step 2: Add the pure mapper**

Map bounded SDK status input to provider-neutral presence. Parse `serverExtension` with structured JSON handling; malformed data for logout/disconnect maps offline rather than guessing from string length.

**Step 3: Add subscription ownership**

Implement atomic Center validation, desired/current set diffing, 100-account batches, a 3,000-account cap, 30-minute subscriptions renewed after 20 minutes, and stable failure events. Register/unregister `onUserStatusChanged` with the existing listener lifecycle and clear renewal state on every terminal lifecycle boundary.

**Step 4: Keep alternate transports conformant**

Mock transport emits deterministic presence. Contract tests assert replace-set behavior and defensive copies.

**Step 5: Run adapter tests**

Run: `npm run test:run -- src/infrastructure/channels/yunxinPresence.test.ts src/infrastructure/channels/YunxinWebChannelTransport.test.ts src/infrastructure/channels/MockChannelTransport.test.ts src/infrastructure/channels/contractTests.ts`

### Task 3: Carry Presence Through Context-Isolated IPC

**Files:**

- Modify: `electron/services/channel.ts`
- Modify: `electron/ipc/channelCommands.ts`
- Modify: `electron/ipc/channelCommands.test.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.ts`
- Modify: `src/infrastructure/channels/ElectronChannelTransport.test.ts`

**Step 1: Write failing boundary tests**

Assert one allowlisted replace-set command, bounded string-array validation, exact service delegation, stable command errors, and event forwarding through the existing `channel-event` allowlist.

**Step 2: Add the command and client method**

Add `set_channel_presence_subscriptions`. Electron main validates the array and delegates; preload exposes no new raw event or SDK object. The renderer adapter includes `presence.subscribe` and maps command failures through existing stable errors.

**Step 3: Run boundary tests**

Run: `npm run test:run -- electron/ipc/channelCommands.test.ts src/infrastructure/channels/ElectronChannelTransport.test.ts electron/preload.test.ts`

### Task 4: Make The Channel Store Own Presence Synchronization

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Step 1: Write failing deterministic store tests**

Cover target derivation from direct conversations, group exclusion, deduplication, catalog changes, reconnect, event projection, custom unknown status, subscription failure, account teardown, disposal, late events, and no duplicate replace calls for an unchanged set.

**Step 2: Add ephemeral projection and serialized synchronization**

Expose sorted `presences`, `activePresence`, and `presenceErrorCode`. Serialize desired-set synchronization after catalog replacement/upserts/deletes and connected lifecycle changes. Only the newest lifecycle may publish results or errors.

**Step 3: Run store tests**

Run: `npm run test:run -- src/features/channels/store.test.ts`

### Task 5: Render Slack-Style Presence Signals

**Files:**

- Create: `src/features/channels/components/ChannelPresenceIndicator.vue`
- Create: `src/features/channels/components/ChannelPresenceIndicator.test.ts`
- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Modify: `src/features/channels/components/ChannelSidebar.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/app/E2eFixtureApp.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Step 1: Write failing component tests**

Cover online, offline, unknown, group omission, accessible labels, direct header status, no layout shift, and locale parity.

**Step 2: Add the shared primitive**

Render a stable-size status dot using existing semantic tokens. Place it over direct-message sidebar avatars and beside the active direct-message heading; keep group rows unchanged.

**Step 3: Add fixture states and run tests**

Run: `npm run test:run -- src/features/channels/components/ChannelPresenceIndicator.test.ts src/features/channels/components/ChannelSidebar.test.ts src/features/channels/components/ChannelTimeline.test.ts`

### Task 6: Document, Verify, And Commit In Phases

**Files:**

- Create: `docs/adr/0042-provider-neutral-contact-presence.md`

**Step 1: Record the decision**

Document ownership, Center validation, provider replacement, batching/capacity, renewal, partial failure, event ordering, security/privacy, restart behavior, and why presence is not durable.

**Step 2: Run full checks**

Run:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
VITE_E2E=true npm run build:web
npm run build:runner
git diff --check
```

**Step 3: Visually verify**

Check desktop and 390 px English/Chinese online, offline, unknown, group, loading, reconnect, keyboard focus, reduced motion, and horizontal overflow states. Reset any temporary browser viewport override.

**Step 4: Commit cohesive phases**

Commit the plan, production contracts/adapter/boundary/store, tests/fixtures, and ADR separately with Conventional Commit subjects and `Model: gpt-5`. Exclude `graphify-out/`. Do not push or open a PR.

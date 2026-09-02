# Provider-Neutral Voice Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one accessible Tea voice player with bounded session progress and no Yunxin coupling above its adapter.

**Architecture:** Yunxin maps a validated attachment URL into the provider-neutral message contract; UIKit confirms playback needs no extra SDK call. A renderer port owns one `HTMLAudioElement`; the store owns mutual exclusion, progress, retry, rate, lifecycle rejection, and a bounded account cache. Components render a Slack-style control and emit intent.

**Tech Stack:** Vue 3, TypeScript, Pinia, Tailwind CSS, MDI icons, Vitest, HTMLMediaElement.

---

## Problem And Invariants

- UIKit is SDK evidence only: it reads `attachment.url` and calls no Yunxin download API. Tea does not copy its event bus, animated voice bubble, warnings, or component-owned coordination.
- `MessageMediaAttachment.url` is already provider-neutral. A future N-API adapter may return a controlled custom-scheme URL without changing the player, store, or components.
- Exactly one voice message may load or play. Switching messages pauses the previous item and retains its position. Pause/resume never starts a second media element.
- The store owns `loading`, `playing`, `paused`, and `failed`, rates `1`, `1.5`, or `2`, and at most 128 account-lifecycle bookmarks. End resets position; deletion, revocation, history/channel deletion, disconnect, account replacement, reconfiguration, and disposal clear affected state.
- Player events carry bounded milliseconds and stable `blocked`, `network`, `decode`, `unsupported`, or `unknown` errors. Raw DOM exceptions, provider URLs, SDK objects, and media errors are not logged or placed in state.
- Late events are generation-scoped. A superseded source cannot pause, fail, or advance the current item. Visibility loss pauses through the player port and updates the store projection.
- No audio bytes or bookmarks are persisted. Chromium may use its HTTP cache. Durable offline media retention remains a separate shared-media owner.

## Alternatives And Non-Functional Requirements

- Per-row `<audio>` is small but duplicates state, permits concurrent playback, and makes lifecycle cleanup a component concern.
- A main-process media proxy would hide remote URLs and enable durable caching, but adds range serving, eviction, encryption, and recovery before other media shares the design.
- The selected renderer player keeps startup responsive, memory bounded, tests deterministic, and N-API replacement possible without a private media protocol.
- Controls support keyboard/focus, readable states, reduced motion, and 390 px English/Chinese timelines.

### Task 1: Define The Playback Port And Deterministic Implementations

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/features/channels/contracts.test.ts`
- Create: `src/infrastructure/channels/BrowserChannelVoicePlaybackClient.ts`
- Create: `src/infrastructure/channels/BrowserChannelVoicePlaybackClient.test.ts`
- Create: `src/infrastructure/channels/MockChannelVoicePlaybackClient.ts`
- Create: `src/infrastructure/channels/MockChannelVoicePlaybackClient.test.ts`

**Step 1: Write failing contract and browser boundary tests**

Cover source validation, one element, play/pause/seek/rate, stable DOM errors, visibility pause, stale events, and disposal. Inject DOM boundaries; use no real audio or time.

**Step 2: Add provider-neutral types and implementations**

Add `ChannelVoicePlaybackClient`, source, event, state, status, error, and playback-rate types. The browser client owns listeners and one element; the mock exposes deterministic event methods.

**Step 3: Run focused tests and commit**

Run: `npm run test:run -- src/features/channels/contracts.test.ts src/infrastructure/channels/BrowserChannelVoicePlaybackClient.test.ts src/infrastructure/channels/MockChannelVoicePlaybackClient.test.ts`

Commit: `feat: add provider-neutral voice playback port`

### Task 2: Make The Store Own Playback And The Bounded Cache

**Files:**

- Modify: `src/features/channels/store.ts`
- Modify: `src/features/channels/store.test.ts`

**Step 1: Write failing deterministic state tests**

Cover eligibility, concurrent toggles, switching, pause/resume, seek, rates, progress, end/reset, stable failures, retry, 128-entry eviction, cleanup, disposal, and late events.

**Step 2: Add the projection and actions**

Configure the player as a fourth feature port. Use an operation generation plus message identity for callbacks. Expose active-channel playback projections and typed toggle, seek, rate, and retry actions; keep cache mechanics private.

**Step 3: Run focused tests and commit**

Run: `npm run test:run -- src/features/channels/store.test.ts`

Commit: `feat: manage voice playback in channel store`

### Task 3: Add Accessible Tea Playback Controls

**Files:**

- Create: `src/shared/ui/TeaSlider.vue`
- Modify: `src/shared/ui/index.ts`
- Modify: `src/shared/ui/__tests__/primitives.test.ts`
- Create: `src/features/channels/components/ChannelVoiceMessagePlayer.vue`
- Create: `src/features/channels/components/ChannelVoiceMessagePlayer.test.ts`
- Modify: `src/features/channels/components/ChannelMessageItem.vue`
- Modify: `src/features/channels/components/ChannelMessageItem.test.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Step 1: Write failing primitive and component tests**

Cover controlled range semantics, keyboard input, accessible names, idle/loading/playing/paused/failed, retry, disabled selection mode, bounded time labels, seek, and rate selection.

**Step 2: Implement the Slack-style control**

Replace the native audio element with one stable unframed row: icon play command, Tea slider, elapsed/total time, and compact Tea menu rate selection. Keep transcript below the same audio block. Use design tokens, no raw palette, shadow, or arbitrary radius.

**Step 3: Run focused tests and commit**

Run: `npm run test:run -- src/shared/ui/__tests__/primitives.test.ts src/features/channels/components/ChannelVoiceMessagePlayer.test.ts src/features/channels/components/ChannelMessageItem.test.ts`

Commit: `feat: add accessible voice playback controls`

### Task 4: Wire The Workflow And Fixture States

**Files:**

- Modify: `src/infrastructure/channels/channelComposition.ts`
- Modify: `src/app/useWorkspaceRuntime.ts`
- Modify: `src/app/useWorkspaceRuntime.test.ts`
- Modify: `src/features/channels/components/ChannelTimeline.vue`
- Modify: `src/features/channels/components/ChannelTimeline.test.ts`
- Modify: `src/app/components/ChannelWorkspace.vue`
- Modify: `src/app/E2eFixtureApp.vue`

**Step 1: Write failing wiring tests**

Assert composition configures one browser player in preview and Electron renderers, Timeline forwards only typed intent, and Workspace delegates to store actions.

**Step 2: Wire projections, actions, and fixtures**

Add `voice-playback-idle`, `loading`, `playing`, `paused`, and `error` fixtures with synthetic messages. Do not load external media during fixture rendering.

**Step 3: Run focused tests and commit**

Run: `npm run test:run -- src/app/useWorkspaceRuntime.test.ts src/features/channels/components/ChannelTimeline.test.ts src/features/channels/store.test.ts`

Commit: `feat: wire voice playback through channel workspace`

### Task 5: Record, Verify, And Review

**Files:**

- Create: `docs/adr/0044-provider-neutral-voice-playback.md`

**Step 1: Record ownership and replacement constraints**

Document why playback uses the existing media URL, why the engine is a renderer port, lifecycle/error/cache semantics, privacy, and the future shared offline-media boundary.

**Step 2: Run all checks**

Run type-check, full tests, format, lint, UI boundaries, web build, runner build, and `git diff --check`.

**Step 3: Visually verify and commit**

Check every fixture on desktop and 390 px English/Chinese, focus, disabled, reduced motion, and no overflow. Reset viewport overrides.

Commit: `docs: record provider-neutral voice playback`

Exclude `graphify-out/`. Do not push, open a PR, or merge.

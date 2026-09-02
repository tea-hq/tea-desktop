# Desktop Channel Notifications Implementation Plan

**Goal:** Add provider-neutral desktop notifications for live incoming IM
messages, including mute, focus, privacy, sound, deduplication, activation, and
settings lifecycles.

**Architecture:** Yunxin maps only `onReceiveMessages` to a distinct
`message.received` event. Electron main owns OS notification policy and asks a
narrow provider source resolver for authoritative channel name and mute state.
Click activation crosses an allowlisted event into a dedicated renderer client;
an app use case navigates through the existing channel store. Vue only edits
notification preferences.

## Problem And Invariants

Tea already projects unread counts, channel mute, and real-time messages but
does not notify users outside the focused window. Reusing `message.upserted`
would notify on edits and locally echoed sends. Browser notifications would
move OS behavior, privacy, and lifecycle state into the renderer.

- UIKit is evidence for Yunxin's `onReceiveMessages` listener only. Tea owns
  notification policy and interaction.
- Only live provider receive callbacks produce `message.received`; message
  modifications remain `message.upserted`.
- Electron main owns OS notification construction, deduplication, focus gates,
  click activation, shutdown, and provider context lookup.
- The provider remains authoritative for channel name and mute state.
- Self-authored, revoked, muted, duplicate, unsupported, or focused-window
  messages do not create notifications.
- Notification previews are bounded and never include provider objects, URLs,
  credentials, native handles, or diagnostics.
- Renderer activation contains only a complete `MessageRef`. It cannot create
  notifications or request arbitrary navigation.
- Settings support enabled/disabled, sound, and `message | sender | hidden`
  preview modes. The persisted contract is replaced directly before 1.0.
- A future Yunxin N-API adapter replaces the receive event and context resolver
  without changing the main policy service, preload, client, store, or UI.

## Rejected Alternatives

- Renderer `Notification` API duplicates desktop lifecycle policy and requires
  message, mute, focus, and permission facts in Vue.
- Treating every `message.upserted` as new cannot distinguish receive, edit,
  local echo, or recovery.
- Provider push notifications are valuable for a closed application but do not
  replace deterministic notification behavior while Electron and IM are live.

## Stable Contracts

`ChannelEvent` adds `message.received` with bounded provider-neutral messages.
The existing reducer treats it as an upsert, but main notification policy can
rely on its live-delivery meaning.

The host-only resolver is:

```ts
interface ChannelNotificationContext {
  channelRef: ChannelRef
  channelName: string
  muted: boolean
}

interface ChannelNotificationSourceResolver {
  resolveNotificationContext(channelRef: ChannelRef): Promise<ChannelNotificationContext>
}
```

The renderer activation boundary is:

```ts
interface ChannelNotificationClient {
  subscribe(listener: (messageRef: MessageRef) => void): () => void
  dispose(): Promise<void>
}
```

Settings add:

```ts
notifications: {
  enabled: boolean
  sound: boolean
  preview: 'message' | 'sender' | 'hidden'
}
```

## Task 1: Separate Live Receive Events

**Files:** channel contracts, reducer, Yunxin adapter, mock transport, and tests.

1. Add `message.received` and make the reducer project it exactly once.
2. Map Yunxin `onReceiveMessages` to received and
   `onReceiveMessagesModified` to upserted.
3. Keep local send/reply/forward echoes as upserted.
4. Cover duplicate/out-of-order reducer input and exact SDK listener mapping.
5. Commit as `feat: distinguish live channel message delivery`.

## Task 2: Define Notification Preferences

**Files:** settings contracts/store/service, SettingsPage, workspace wiring,
locales, and tests.

1. Replace the pre-1.0 persisted settings schema with version 2 and required
   notification settings; version 1 is rejected rather than migrated.
2. Add optimistic store updates with rollback through the existing write queue.
3. Add dense unframed enabled, sound, and preview controls in Settings.
4. Add every label to English and Chinese and cover disabled/saving states.
5. Commit as `feat: add desktop notification preferences`.

## Task 3: Resolve Provider Notification Context

**Files:** host-only context contract, Yunxin adapter, Electron channel service,
and tests.

1. Resolve the current conversation from the connected provider by channel ref.
2. Map only bounded channel name and mute state.
3. Fail closed on missing, malformed, disconnected, or SDK-failed context.
4. Commit as `feat: resolve channel notification context`.

## Task 4: Own Desktop Notifications In Main

**Files:** Electron notification service, main composition, and tests.

1. Inject a notification factory, window-focus predicate, settings snapshot,
   context resolver, and activation callback for deterministic tests.
2. Ignore non-received events, self messages, inactive messages, focused
   windows, disabled preferences, muted channels, and duplicate message refs.
3. Collapse each received batch to the newest eligible message per channel,
   bound work to 20 channels, and retain at most 512 dedupe keys.
4. Bound title/body, apply preview and sound settings, recheck focus after async
   context resolution, and emit activation only from the matching notification.
5. Dispose all notification handles and memory state on shutdown.
6. Commit as `feat: show provider-neutral desktop notifications`.

## Task 5: Route Notification Activation

**Files:** Electron bridge types/preload tests, renderer client/composition,
workspace runtime, and tests.

1. Add an allowlisted `channel-notification-activated` event with strict
   `MessageRef` payload typing.
2. Implement Electron and no-op preview clients with deterministic disposal.
3. Subscribe once per workspace session and call `channels.jumpToMessage` from
   the app use case; stale/logged-out activation is ignored.
4. On main activation, restore and focus the window before publishing the ref.
5. Commit as `feat: open channels from desktop notifications`.

## Task 6: Validate And Record

1. Add synthetic Settings fixtures for English, Chinese, saving, and disabled
   notification states.
2. Verify 390px and desktop layouts, keyboard controls, reduced motion, no
   overflow, and no console errors.
3. Add ADR 0046 covering ownership, event semantics, privacy, replacement,
   cancellation, recovery, and the closed-app push boundary.
4. Run all default checks and commit fixtures/documentation separately.

## Failure, Recovery, And Closed-App Boundary

Context lookup or notification construction failure is best-effort and never
changes the message, unread count, or connection. Reconnect does not replay old
received events. A click after logout cannot navigate because the current
workspace client has been disposed.

This design covers live Electron sessions. Notifications while Tea is fully
closed require a separate signed push/background-delivery architecture with
tenant routing, device registration, revocation, payload privacy, credential
storage, and OS-specific packaging. It must feed the same activation contract
and must not expose provider push payloads to Vue.

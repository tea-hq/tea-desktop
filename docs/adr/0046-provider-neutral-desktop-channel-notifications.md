# ADR 0046: Provider-Neutral Desktop Channel Notifications

- Status: Accepted
- Date: 2026-09-03

## Context

Tea is an enterprise collaboration IM. A user may be working in another
workspace surface, or the window may be minimized, when a live channel message
arrives. The UI already receives channel events and maintains unread state, but
it needs a native desktop signal that does not duplicate message projection or
leak provider fields into Vue.

Tea may replace the Yunxin Web SDK with a native N-API adapter. UIKit is useful
for confirming the Yunxin receive callback, but its notification UI and event
model are not product contracts. Notification policy, privacy, and activation
must remain stable across providers.

## Decision

Only a provider adapter's live receive callback produces
`ChannelEvent.type === 'message.received'`. Edits, revocations, local echoes,
history loads, and reconnect projections use other event types. The channel
store projects received messages exactly like upserts, while Electron main uses
the event type to decide whether a desktop notification is eligible.

Electron main owns notification construction and policy:

```text
provider adapter
  -> message.received
  -> Electron channel service
  -> ChannelNotificationService
  -> OS notification
  -> channel-notification-activated(MessageRef)
  -> renderer activation client
  -> workspace use case
  -> channels.jumpToMessage(MessageRef)
```

The service resolves only a bounded `ChannelNotificationContext` from the
authoritative provider conversation: `channelRef`, display name, and mute
state. It ignores self-authored, revoked, malformed, duplicate, muted, or
focused-window messages. Each received batch collapses to its newest message
per channel and is bounded to 20 channels; the dedupe set is bounded to 512
message references. Context lookup and native notification construction are
best-effort and never alter message, unread, or connection state.

## Privacy And User Controls

Settings are a version-2 pre-1.0 contract with explicit `enabled`, `sound`, and
`message | sender | hidden` preview preferences. Disabled notifications also
disable dependent sound and preview controls in the settings UI. Main rechecks
settings and window focus after asynchronous context lookup, then sanitizes
and bounds title/body text before passing it to Electron. Notification payloads
never contain provider objects, URLs, credentials, filesystem paths, native
handles, or diagnostics.

The click payload is a complete provider-neutral `MessageRef` only. Preload
allowlists the event, and the renderer client validates bounded non-empty
reference parts before invoking the workspace action. A stale or logged-out
workspace ignores the event. The app does not request notification permission
from the renderer or use the browser Notification API.

## Ownership, Cancellation, And Recovery

`ChannelNotificationService` owns active notification handles, click
correlation, duplicate activation suppression, and shutdown cleanup. Clicking
restores, shows, and focuses the BrowserWindow before main publishes the
activation ref. Closing the window or quitting disposes all handles and clears
dedupe memory before the channel provider is disconnected.

The workspace environment owns one activation client per workspace session.
The workspace runtime subscribes once after configuration, checks the current
lifecycle generation before navigation, and disposes the subscription on
account replacement, logout, reconfiguration, or unmount. Jump failures are
passive best-effort failures: the user can continue using the current channel
surface and message state is unchanged. Reconnect never replays old received
events, so it cannot create a notification storm.

## Provider Replacement And Closed-App Boundary

Replacing Yunxin Web with N-API requires only an adapter that preserves the
live-receive event semantics and context resolver contract. Native listener
handles, SDK conversation objects, mute APIs, and credential access remain
below that boundary. The main notification service, preload event, renderer
client, settings, store, and workspace action do not branch on provider or
runtime name.

This decision covers an active Electron session. Notifications while Tea is
fully closed require a separate signed push/background-delivery architecture
with tenant routing, device registration, revocation, credential storage,
payload privacy, OS packaging, and recovery. Such a service must feed the same
`MessageRef` activation contract and must not expose push payloads to Vue.

## Consequences

- Native notification behavior is deterministic and testable without real OS
  notifications or provider network calls.
- Slack-style compact channel alerts can evolve independently of UIKit while
  preserving the provider-neutral data and lifecycle boundaries.
- Privacy settings and focused-window behavior are enforced in the host, where
  the authoritative context and native notification APIs are available.
- A future closed-app push system remains an explicit architecture rather than
  an implicit browser fallback.

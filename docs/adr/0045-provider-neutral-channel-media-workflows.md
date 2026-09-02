# ADR 0045: Provider-Neutral Channel Media Workflows

- Status: Accepted
- Date: 2026-09-03

## Context

Tea needs received image and video viewing plus explicit image, audio, video,
and file saving. The earlier timeline rendered provider URLs through an image,
inline video controls, or a new-window file link. That proved the Yunxin field
mapping but made the renderer responsible for provider sources and browser
download behavior.

Tea may replace the Yunxin Web SDK with a native N-API adapter. Media
interaction, cancellation, stable errors, and filesystem safety must remain
unchanged when that happens. UIKit is evidence for SDK attachment fields and
cached-message lookup only; Tea does not copy its components, event bus, or
interaction model.

## Decision

Viewing is an ephemeral renderer projection. The channel store holds one
active image or video `MessageRef`, derives previous and next candidates from
the active message window, and exposes no separate media catalog. Vue receives
the current provider-neutral message and emits open, close, previous, and next
intent. Native video controls appear only inside the viewer; the timeline uses
a compact Slack-style preview with Tea tokens.

Saving crosses a separate `ChannelMediaClient` port:

```text
Vue intent
  -> channel store
  -> ChannelMediaClient
  -> allowlisted preload IPC
  -> ChannelMediaSaveService
  -> ChannelMediaSourceResolver
  -> active provider cached message
```

A request contains a complete `MessageRef` and a Tea-owned operation id. It
never contains a URL, provider message, filesystem path, credential, or native
handle. The active provider is authoritative for message eligibility and the
current source metadata. It accepts only active cached image, audio, video, or
file messages with a usable source and returns bounded provider-neutral
metadata to Electron main.

The store owns `choosing`, `saving`, `saved`, `failed`, and `cancelled`
projections, one active save, explicit retry eligibility, and at most 128
recent account-lifecycle entries. Components only render these values and emit
intent. They do not fetch, construct CDN URLs, choose destinations, map errors,
retry, write files, or inspect provider objects.

## Host And Security Boundary

Electron main owns the destination dialog, network request, redirects,
timeouts, response bounds, cancellation, and filesystem write. Only HTTPS
sources are accepted. Redirects are limited to five, elapsed download time to
30 seconds, and response size to 1 GiB. Filenames and provider metadata are
bounded before use.

The service writes to an exclusive sibling `.part` file, closes it after the
complete body is flushed, and atomically renames it to the selected destination.
Every cancellation and failure path removes the partial file. Renderer IPC is
limited to validated save and cancel commands plus bounded progress events.
Provider URLs, destination paths, fetch failures, and native exceptions are
not persisted or returned to Vue.

Stable save failures are `invalidRequest`, `messageUnavailable`,
`mediaUnavailable`, `unsupportedProtocol`, `tooLarge`, `downloadFailed`,
`writeFailed`, and `unknown`. Only download, write, and unknown failures may be
retryable. Closing the destination dialog is a successful `cancelled` result,
not an error.

## Ordering, Cancellation, And Recovery

Every operation captures the account lifecycle generation, client instance,
operation id, and complete message reference. Progress and Promise completion
must match all four before changing state. Late, duplicate, or out-of-order
events cannot revive a replaced operation.

Starting a new save cancels the active one. Explicit cancellation aborts the
request and cleans the partial file. Disconnect, kicked-offline, account
replacement, reconfiguration, workspace exit, and disposal cancel active work
and clear media projections. Message deletion, revocation, history deletion,
channel deletion, or replacement with non-media content clears only affected
viewer and save state.

Reconnect reloads provider messages but never resumes a save or reopens a
viewer. A user may retry while the provider still owns the referenced message.
A failed save never changes or rolls back the message.

## Offline Media Boundary

An explicit user save is not Tea's offline cache. The final destination is
user-selected and is not added to channel state, renderer storage, the runtime
catalog, Tea Center, logs, or analytics. Save projections disappear with the
account lifecycle.

Automatic offline retention remains a separate subsystem. It must define
encryption, tenant and account isolation, integrity, quotas, eviction, range
reads, logout cleanup, recovery, and stable errors for messages and media
together. It must not reuse user-selected save paths or treat Chromium cache as
durable state.

## Versioning And Provider Replacement

This is the initial pre-1.0 transient contract, so no compatibility alias,
fallback downloader, persisted schema, or provider branch is added. A future
contract change must define capability negotiation, migration, rollback,
recovery, error compatibility, and removal criteria before changing
renderer-visible fields.

Replacing Yunxin Web with N-API requires an adapter that preserves cached
message lookup, complete-reference validation, media eligibility, normalized
metadata, and stable redacted failures through `ChannelMediaSourceResolver`.
Native download handles, file descriptors, credentials, and SDK-specific CDN
parameters remain below that boundary. The IPC contract, save service, client,
store, workspace, and components do not branch on provider or runtime name.

## Consequences

- UIKit remains SDK-call evidence while Tea owns Slack-informed interaction.
- Provider replacement is isolated below a narrow media source resolver.
- Host-owned bounded downloads give deterministic cancellation and atomic
  local files without exposing filesystem capability to the renderer.
- Viewer and save state remain ephemeral and cannot become a competing message
  fact store.
- Encrypted offline message and media retention requires its own architecture.

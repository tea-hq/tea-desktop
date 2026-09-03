# ADR 0044: Provider-Neutral Voice Playback

- Status: Accepted
- Date: 2026-09-03

## Context

Tea needs accessible, mutually exclusive playback for voice messages without
making Yunxin attachment objects or SDK lifecycle calls part of the renderer
contract. Tea may later replace the Yunxin Web SDK with a native N-API
implementation, while playback state, store actions, and timeline interaction
must remain unchanged.

The reference UIKit reads the mapped attachment URL and gives it directly to a
browser audio element. It does not call a separate Yunxin download or playback
API. This is SDK-call evidence only: Tea does not copy UIKit's event bus,
component-owned playback coordination, animated voice bubble, or visual
interaction. Tea owns a dense workspace control consistent with its design
system and Slack-style message interaction.

## Decision

`MessageMediaAttachment.url` remains the provider-neutral media source. The
Yunxin adapter validates and maps provider data into that contract. No SDK
message, provider attachment, credential, native handle, download task, or raw
error crosses into the store or Vue components.

`ChannelVoicePlaybackClient` is the renderer platform boundary. The browser
implementation owns exactly one `HTMLAudioElement`, accepts only bounded
`https:` or `blob:` sources, preloads metadata, and exposes typed play, pause,
seek, rate, stop, and dispose commands. Events contain only bounded
milliseconds or stable `blocked`, `network`, `decode`, `unsupported`, and
`unknown` failures. Source URLs and DOM exceptions never enter public playback
state or logs.

Channel composition creates one playback client for each workspace environment
in both preview and Electron renderers. The workspace runtime gives that client
to the channel store as its fourth feature port. Context isolation is
preserved: playback needs no Electron IPC command because it consumes the
already mapped media source inside the renderer and exposes no Node or native
capability.

The channel store owns mutual exclusion and the replayable UI projection. At
most one message may be loading or playing. Starting another message stops the
current source and preserves its bounded position. The store owns `loading`,
`playing`, `paused`, and `failed`, playback rates `1`, `1.5`, and `2`, retry
eligibility, seeking, and at most 128 account-lifecycle bookmarks. Public state
contains message identity, status, time, rate, and stable errors only; its
private source cache is memory-only.

Vue components receive projection values and emit typed intent. They do not
create audio elements, choose sources, coordinate concurrent messages, map
errors, retry, persist progress, or inspect the provider. The shared Tea slider
owns range semantics and accessible keyboard behavior. The message player
renders play or pause, bounded time, seeking, playback speed, loading,
disabled, and retryable failure states without loading fixture media during
rendering.

## Ordering, Cancellation, And Recovery

Each play operation captures a monotonically increasing generation and the
complete message reference. Events from a stopped, replaced, deleted, revoked,
or earlier source are ignored. A synchronous `play` failure and an asynchronous
media failure converge on the same stable failed projection.

Visibility loss pauses the single media element and projects the pause through
the existing listener. Deletion, revocation, history deletion, channel
deletion, disconnect, kicked-offline, account replacement, reconfiguration,
workspace exit, and store disposal stop affected playback and clear the
corresponding projection. Disposal also detaches media and visibility
listeners. Reconnect never resumes audio automatically.

Playback progress, sources, and audio bytes are not written to the conversation
catalog, channel drafts, renderer storage, Tea Center, logs, or analytics.
Chromium may use its ordinary HTTP cache, but Tea does not claim that cache as
durable or offline state. Restart recovery begins with the provider-neutral
message and no bookmark. Playback failure never changes or rolls back the
underlying message.

## Offline Media Boundary

Durable or offline media retention is deliberately separate. A future shared
media service must define encrypted storage, tenant and account scoping, range
reads, integrity validation, quotas, eviction, logout cleanup, cancellation,
recovery, and stable errors for audio, image, video, and files together. It may
then provide an accepted provider-neutral source to this player. The voice
store must not grow an ad hoc Yunxin downloader or persistent cache.

## Versioning And Replacement

This is the initial pre-1.0 transient contract, so no compatibility alias,
fallback player, persisted schema, or provider branch is added. A future
contract change must define capability negotiation, error compatibility,
downgrade behavior, migration, rollback, recovery, and removal criteria before
changing renderer-visible fields.

Replacing Yunxin Web with N-API requires an adapter that preserves the media
attachment contract and supplies a bounded accepted source, currently `https:`
or `blob:`. Native file descriptors, SDK download handles, custom schemes, and
credentials remain below the adapter unless a new provider-neutral media port
is designed. The playback client, store, workspace wiring, and components do
not branch on the provider or runtime name.

## Consequences

- UIKit remains evidence for the absence of a separate playback SDK call;
  Tea's interaction and visuals remain independent.
- Yunxin Web and a future N-API adapter share the same message and playback
  contracts above the adapter.
- One media element gives deterministic mutual exclusion, cleanup, and stale
  event rejection without placing transport behavior in components.
- Session bookmarks improve navigation without creating undeclared durable
  media or activity records.
- Offline playback and shared media retention require a separate architecture
  rather than provider-specific expansion of the voice player.

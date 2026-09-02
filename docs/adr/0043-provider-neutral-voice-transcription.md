# ADR 0043: Provider-Neutral Voice Transcription

- Status: Accepted
- Date: 2026-09-03

## Context

Tea needs on-demand transcripts for voice messages without making Yunxin voice
attachments or service parameters part of the application contract. Tea may
later replace the Yunxin Web adapter with a native N-API implementation, while
the renderer interaction, Electron boundary, and store lifecycle should remain
unchanged.

Voice transcripts are sensitive derived message content. Treating them as
provider message fields or durable conversation facts would create a second
source of truth and an undeclared retention policy. Automatically adding them
to Agent context would also disclose content beyond the user's explicit IM
action.

## Decision

`ChannelTransport` advertises `message.voice.transcribe` and exposes
`transcribeVoice(messageRef)`. The input is the provider-neutral account,
conversation, and message reference already used by other message commands;
the result is bounded plain text. No attachment URL, SDK message, provider
error, credential, or transcription option crosses the port or Electron IPC.

The active transport is the authority for message eligibility. It accepts only
an active cached audio message matching the complete reference. Missing or
stale messages, other content types, deleted or revoked messages, non-HTTPS
audio URLs, invalid durations, invalid attachment data, and empty provider
results fail closed with stable transport errors.

The Yunxin adapter maps the cached provider message to `voiceToText` with the
voice URL, millisecond duration, AAC MIME type, 16 kHz sample rate, and an
optional bounded scene name. These values are adapter details, not application
defaults. SDK rejection details are redacted; callers receive stable error
codes and may retry explicitly.

Provider output is trimmed, validated, and limited to 32 KiB before it leaves
the adapter. Electron main validates the bounded message reference, delegates
once, and validates the bounded result. Preload exposes only the typed command.
There is no provider event channel or raw IPC access for transcription.

The channel store owns the transient renderer projection with `idle`,
`loading`, `ready`, and `failed` states. It gates requests on the advertised
capability, coalesces concurrent requests for the same message, caches a
successful result for the current account lifecycle, and permits an explicit
retry after failure. Components render that projection and emit intent; they
do not inspect attachments, invoke the SDK, cache text, or manage retries.

## Ordering, Cancellation, And Recovery

Each request captures the store account lifecycle and the target message
reference. Disconnect, kicked-offline, account replacement, or disposal
invalidates pending work and clears every transcript. Deletion or revocation
clears only the affected message. A late success or failure from an invalid
lifecycle cannot repopulate state, and concurrent callers observe one active
request rather than starting duplicate provider operations.

The provider transcription call has no exposed cooperative cancellation. Tea
therefore performs logical cancellation at the store boundary and discards
late results. Reconnect does not automatically retranscribe. Users see an idle
eligible message and may request a fresh transcript when the transport is
available again.

Transcripts are never written to the conversation catalog, draft catalog,
renderer storage, Tea Center, logs, analytics, or provider-neutral message
records. A restart recovers only the original voice message and starts with no
transcript. A transcription failure never changes, deletes, or rolls back the
underlying message.

## Agent Privacy Boundary

A transcript is not an Agent source merely because it is visible in the IM
timeline. Agent workflows must not silently read the store cache, reconstruct
transcripts during replay, or append them to prompts. A future user action that
shares a transcript with an Agent requires a separate typed contract with
explicit selection, auditability, retention, size, cancellation, and error
semantics.

## Versioning And Replacement

This is the initial pre-1.0 transient contract, so no alias, persisted schema,
provider fallback, or compatibility reader is added. A future contract change
must define capability negotiation, error compatibility, downgrade behavior,
and removal criteria before changing renderer-visible fields.

Replacing Yunxin Web with N-API requires an adapter that preserves capability
advertisement, message-reference eligibility, HTTPS and duration validation,
the 32 KiB result bound, stable redacted errors, and logical cancellation at
the store lifecycle. Native request handles or richer provider options remain
below the transport unless a new provider-neutral capability needs them.

## Consequences

- UIKit remains evidence for the SDK call only; Tea owns its interaction and
  visual presentation.
- SDK replacement is isolated to the adapter while Electron, store, and Vue
  contracts remain stable.
- Transcript loss on restart is intentional and avoids an undeclared durable
  content store.
- Search, export, durable transcript sync, and Agent sharing require separate
  privacy and lifecycle decisions.

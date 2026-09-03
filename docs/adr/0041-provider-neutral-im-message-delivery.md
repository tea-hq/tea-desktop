# ADR 0041: Provider-Neutral IM Message Delivery

- Status: Accepted
- Date: 2026-09-03

## Context

Tea exposed one global `sendingMessage` flag and one upload percentage for the
entire composer. A failed text or media send had no stable row identity, could
not be retried independently, and lost reply/mention context. The Yunxin Web
SDK exposes provider-specific `sendingState` values, but Tea may replace that
adapter with a native N-API implementation. Provider state therefore cannot
become a renderer contract or component state machine.

Media selection also issued opaque main-process tokens that the Yunxin adapter
released in every `finally` block. A retryable failure consequently destroyed
the only safe reference to the local file before retry could occur.

## Decision

The channel store owns an ephemeral `OutgoingMessageAttempt` projection. Its
stable identity contains a Tea-generated attempt id and idempotency key. Each
execution receives a fresh operation id and carries content, mentions, a reply
snapshot, progress, attempt count, stable error code, and retryability.
Statuses are `sending`, `failed`, and `cancelled`. A provider-confirmed
`Message` is the sent state; Tea does not create a second durable message fact.

Initial send and retry use the same `ChannelTransport.sendMessage` and
`replyMessage` ports. Retry reuses the idempotency key and content but replaces
the operation id. Components render state and emit retry, cancel, or dismiss
intent. The store owns transport calls, stale lifecycle rejection, and state
transitions. Multiple attempts may run concurrently, so the composer is not
blocked by an unrelated upload.

Human composer text keeps one durable recovery owner: `ChannelDraftClient`.
Before starting a composer submission, the store flushes its text and mention
snapshot. It creates and correlates every attempt in the batch before invoking
the transport, so a provider event emitted synchronously by `sendMessage`
cannot race batch registration. Reply and selected attachment UI state may
clear after the attempts take ownership, but the text draft remains until every
batch item is provider-confirmed. An unresolved batch disables duplicate
submission while still allowing edits. Confirmation removes the draft only
when it still matches the submitted snapshot; later edits are never cleared by
an older batch.

A failed, cancelled, or explicitly dismissed delivery preserves the durable
draft. Retry or a late `message.upserted` confirmation participates in the same
batch and removes the matching draft after the last item is confirmed. If
durable draft removal fails, the in-memory projection is restored and exposes
a stable storage error without changing the confirmed message result.

The existing request `idempotencyKey` is copied into a bounded Tea-owned
provider extension:

```json
{
  "teaDelivery": {
    "version": 1,
    "clientReference": "im-send:v1:<opaque-id>"
  }
}
```

The Yunxin mapper exposes only the provider-neutral `Message.clientReference`.
Normal `message.upserted` events reconcile an uncertain or late attempt with
the provider message and remove the local row. Unknown or unsupported
`teaDelivery.version` values are ignored. The full provider extension remains
bounded by the existing 4 KiB and depth limits.

Unknown SDK send failures become retryable `ChannelTransportError('transport')`
values. Existing stable Tea errors pass through. Numeric provider errors do
not cross Electron IPC. Cancellation is best effort because Yunxin does not
offer hard cancellation for every send/upload stage. A cancelled attempt keeps
its retry context; a later confirmed provider message remains authoritative.

`ChannelAttachmentPicker` owns attachment-handle lifetime through explicit
`pick` and idempotent `release` methods. The Yunxin adapter only resolves a
handle while creating a provider message. Retryable failures and cancellation
retain it. Confirmed success, explicit dismissal, account teardown, channel
deletion, and disposal release it. Cleanup failure never converts a confirmed
send into a failed send; main-process TTL and capacity pruning remain the
fallback cleanup path.

Outgoing attempts are process-scoped and are not written into provider history
or the human IM draft catalog. The submitted text remains an ordinary durable
human draft until confirmation, so a restart recovers editable text without
pretending to reconstruct an uncertain transport attempt. Synchronized
provider messages remain authoritative. Durable offline queuing would require
a separate versioned catalog with explicit attachment re-selection semantics
rather than serializing opaque tokens.

## Versioning And Recovery

`teaDelivery.version = 1` is the initial pre-1.0 wire contract. Before 1.0, an
incorrect shape is replaced directly; no aliases, duplicate readers, or
fallback extension fields are added. A future version must define coexistence,
provider size impact, downgrade behavior, and removal criteria before writing
the new value.

The extension is additive to caller metadata and mention encoding. Rolling
back to a build that does not recognize `teaDelivery` leaves normal message
content readable because older mappers already preserve unknown bounded JSON.
Rolling forward reconstructs correlation only for messages that still carry a
supported version. Missing or malformed correlation never hides a provider
message; it only prevents automatic local-attempt reconciliation.

## Consequences

- Replacing Yunxin Web with N-API requires translating the same request key,
  operation cancellation, progress event, stable errors, and confirmed-message
  correlation; stores and components do not branch on provider name.
- Text, reply, mention, and media retry share one state machine and one UI.
- Confirmed messages cannot be reverted by attachment cleanup failure.
- Exact cross-device de-duplication still depends on provider support. Tea
  provides in-process de-duplication and event reconciliation but does not
  claim stronger delivery guarantees than the active provider can prove.

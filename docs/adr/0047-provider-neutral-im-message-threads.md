# ADR 0047: Provider-Neutral IM Message Threads

- Status: Accepted
- Date: 2026-09-03

## Context

Tea is an enterprise collaboration IM. A quoted message is useful for a
single reply, but decisions and follow-up questions need a focused discussion
that stays attached to one channel message. The Yunxin SDK exposes a thread
message query, while Tea must keep the interaction and state model independent
from that provider.

Tea may replace the Yunxin Web SDK with a native N-API adapter. UIKit is
evidence for the SDK call and message fields only; its visual and interaction
model is not a Tea contract. The product surface follows Tea's dense workspace
and Slack-informed thread behavior.

## Decision

Tea models a thread as a provider-neutral, message-rooted projection:

```text
Vue thread panel
  -> channel store/use case
  -> ChannelTransport.loadThread(MessageRef)
  -> provider adapter
  -> cached provider root + bounded replies
```

`ChannelTransport.loadThread` accepts a complete `MessageRef` and returns a
`ChannelThread` containing the normalized root, replies, count, channel ref,
and timestamp. Yunxin `getThreadMessageList` parameters, raw `refer` values,
SDK objects, and provider thread fields remain inside
`YunxinWebChannelTransport`. A future N-API implementation only needs to
preserve this port and its error semantics.

The channel store owns the selected root, loading and retryable error state,
operation generations, and reconciliation. The panel renders those values
and emits typed close, retry, and send intents. Thread state is ephemeral and
is not written to the catalog or reconstructed as a second message store.

Thread replies reuse `replyMessage` with the root `MessageRef`. Existing
outgoing-attempt correlation, idempotency, mentions, attachment ownership,
cancellation, retry, and dismiss behavior therefore apply to replies without
another delivery state machine. A confirmed reply is authoritative; the
store reloads the thread to reconcile it rather than manufacturing a second
message fact.

## Lifecycle And Failure Semantics

- Opening an active message starts one bounded load for that root. Switching
  roots, channels, accounts, or transports invalidates the previous
  generation; late results cannot repopulate the current panel.
- Invalid or stale roots return `invalidRequest`; provider and network
  failures return retryable `transport`, and malformed or unbounded provider
  results fail closed as `protocolFailure`.
- Deleting or revoking the root closes the thread and clears transient reply
  attempts. Replies remain in the provider message projection and are removed
  from the thread projection when the authoritative event says so.
- A failed reply keeps the panel open with the existing outgoing-attempt
  projection. Retry reuses its idempotency key; cancellation and dismissal do
  not delete an authoritative message.
- Disconnect, logout, account replacement, reconfiguration, and disposal
  clear the selected root, replies, loading state, and error state.

## Provider Replacement And Versioning

This is the initial pre-1.0 transient contract. No compatibility alias,
fallback state machine, provider branch, or persisted migration is added. A
future public contract change must define capability negotiation, migration,
rollback, recovery, and stable error compatibility before changing the
renderer-visible DTO.

Replacing Yunxin Web with N-API is isolated to the adapter and its tests. The
transport, Electron IPC, preload allowlist, store, workspace, and components
continue to use `MessageRef` and `ChannelThread` without branching on provider
or runtime name.

## Consequences

- Thread behavior can evolve toward richer Slack-style navigation without
  copying UIKit components or SDK lifecycle code into Vue.
- The main timeline remains the navigation source and does not duplicate
  replies, while the thread panel provides a compact focused composer.
- Provider replacement is bounded to one transport operation, but every
  adapter must preserve root validation, bounded results, lifecycle rejection,
  and redacted stable errors.

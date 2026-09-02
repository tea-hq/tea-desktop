# Provider-Neutral IM Message Threads

## Problem

Tea currently supports quoting one message while composing, but a Channel
does not expose the complete discussion that grows around a message. Enterprise
collaboration needs a focused thread surface so decisions stay attached to
their source without turning the main timeline into a second conversation.
The Yunxin SDK already provides a thread-message query; that API is evidence
for the adapter only. Tea owns the thread interaction and visual density.

## Invariants

- `ChannelTransport` exposes one provider-neutral `loadThread` operation. The
  renderer passes only a `MessageRef`; no Yunxin refer, SDK message, or
  provider thread field crosses the boundary.
- A thread is scoped to one channel and one root message. The transport
  validates that the root is known and returns bounded root/reply messages,
  `replyCount`, and a provider-neutral timestamp.
- The channel store owns the selected root, loading/error state, lifecycle
  generations, and thread reply sends. Vue components render projections and
  emit typed intent only.
- Thread replies use the existing `replyMessage` transport port, preserving
  message delivery retries, idempotency, mentions, and attachment ownership.
  A reply confirmed by the provider is authoritative; the thread reloads to
  reconcile the projection rather than creating a second message fact.
- Thread state is ephemeral. Channel/account replacement, disconnect, root
  deletion/revocation, and disposal clear it. A late load or send cannot
  repopulate a later channel or root.
- The main timeline remains the source of message navigation. Opening a
  thread does not duplicate replies into the channel projection; selecting a
  thread reply jumps to its message when it is present in the timeline.

## Flow

1. An active message action exposes `Open thread` when `message.thread` is
   available. The workspace asks the channel store to load that root.
2. The store validates the root against the active channel, starts one
   operation-scoped load, and projects the provider-neutral thread result.
3. The Yunxin adapter resolves the cached raw root message and calls
   `V2NIMMessageService.getThreadMessageList({ messageRefer, limit, direction })`.
   It maps and bounds the root and replies using the existing mapper.
4. The thread panel renders the root, replies, reply count, loading/error/retry,
   and a compact composer. Sending invokes `replyMessage` with the root ref;
   success triggers a bounded reload and retains the panel.
5. A thread reply can be staged to the Agent using the existing message action
   path, so Agent context includes the same stable message reference and text.

## Failure And Recovery

- Invalid or stale roots fail with `invalidRequest` and do not clear the main
  timeline. Provider/network failures expose retryable `transport` state.
- Malformed provider results fail closed with `protocolFailure`; partial or
  unbounded replies are never rendered.
- A root deletion/revocation closes the thread and clears transient send state.
- A reply send failure uses the existing outgoing-attempt projection and keeps
  the thread open. The user can retry or dismiss without losing the draft.
- Thread loads are serialized per selected root. Replacing the root or
  transport invalidates previous generations and ignores late completions.

## Verification

- Contract tests cover bounded thread DTOs, capability advertisement, root
  validation, and transport delegation.
- Yunxin tests assert exact SDK thread parameters, raw-root resolution, result
  mapping, provider failure redaction, and malformed result rejection. Mock
  tests cover deterministic replies and stale roots.
- Store tests cover open/retry, root switching, lifecycle cleanup, send/reload,
  and late completion rejection.
- Component tests cover the action entry point, root/reply rendering,
  loading/error/empty states, accessible retry/close/send controls, and
  390px English/Chinese layout fixtures.


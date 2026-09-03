# ADR 0035: Bidirectional Message Windows

- Status: Accepted
- Date: 2026-09-02
- Amends: ADR 0008 and ADR 0033

## Context

The channel timeline is a window over provider history, not a second message
store. The first request loads the newest available page with a `before`
request. Older history and missed newer messages use different provider anchors.
Using one cursor for both directions can overwrite the older boundary when a
reconnect or a catch-up request completes out of order. A late delete can also
leave an anchor that a provider no longer accepts.

Tea may replace the Yunxin Web SDK with a native N-API adapter. Pagination must
therefore remain expressed in the provider-neutral `LoadMessagesRequest` and
`MessagePage` contracts.

## Decision

`useChannelsStore` keeps independent `before` and `after` cursor boundaries per
channel and records whether the newest known window has been loaded. Initial
selection uses `before` without an anchor and establishes the newest loaded
message as the `after` anchor. Older pages advance only the `before` boundary;
newer pages advance only `after`. A forced newer load can probe for messages
missed during reconnect even when the previous newer page reported no more
items.

Loading locks are keyed by channel and direction and carry an operation id.
When a transport is replaced, an old request may finish but cannot mutate the
projection or clear a newer request's loading state. Realtime deletes that
remove a boundary re-anchor to the remaining first/last message. Channel
deletion and history-clear events discard both cursors.

The projection continues to deduplicate and sort by provider-neutral message
identity and sent time. Scroll restoration remains a UI concern: prepending an
older page restores the previous scroll offset relative to the new scroll
height, while a newer page does not force the user to the bottom unless the
existing near-bottom policy applies.

## Invariants

- A `before` page cannot change the `after` `hasMore` flag or anchor.
- An `after` page cannot change the `before` `hasMore` flag or anchor.
- Stale transport responses cannot repopulate a replaced account or loading lock.
- A deleted cursor anchor is replaced before the next provider request.
- Provider DTOs and SDK lifecycle objects do not cross the channel contract.

## Migration and rollback

This is an unreleased in-memory store change, so no persisted cursor migration
is required. A future native adapter implements the same directional request
and response contract. Rolling back the adapter does not require changing the
renderer or store cursor model.

## Testing consequences

Store tests cover independent directional cursors, forced newer pagination,
stale response protection, and cursor re-anchoring after deletion. Mock and
Yunxin adapter tests continue to cover directional anchors and provider mapping.

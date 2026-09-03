# ADR 0037: Provider-Neutral Pinned Message Catalog

## Status

Accepted

## Context

Pinned messages are durable channel facts owned by the IM provider. Yunxin
returns pin records separately from message content, so displaying the catalog
requires resolving provider message references in a second call. Tea may later
replace the Web SDK with a native N-API implementation; Yunxin pin DTOs and
message references must not cross the channel transport boundary.

## Decision

`ChannelTransport.listPinnedMessages` accepts a provider-neutral `ChannelRef`
and returns `PinnedMessage` values containing a provider-neutral `Message`, the
optional account that pinned it, and the pin timestamp. The Yunxin adapter gets
the channel pin records, resolves their message references, rejects records
from another channel, maps valid messages, and sorts the result by newest pin
first. The Electron command, service, IPC allowlist, and renderer transport
carry only this stable contract.

The channels store owns loading, stale-response rejection, projection merging,
and realtime reconciliation. Message updates refresh the content of an open pin
catalog without changing its pin fact. Unpin, delete, history-clear, and channel
delete events remove invalid catalog entries. Components only open, retry,
close, and select a pinned message; selecting delegates to the existing
provider-neutral message jump workflow.

## Error and recovery

Invalid channel references fail with `invalidRequest`. Provider failures use
the normal retryable `transport` code, while malformed provider results use
`protocolFailure`. A request completing after an account, transport, channel,
or dialog lifecycle change cannot replace current store state. Missing or
unmappable referenced messages are omitted because the provider no longer has
enough durable data to navigate to them; a later reload can recover them.

## Consequences

A future native adapter implements one catalog method and maps its own pin and
message records without changing stores or components. The provider remains
the source of truth, while renderer state stays a replayable projection. The
catalog has no persisted renderer schema, so this unreleased contract needs no
migration or compatibility aliases.

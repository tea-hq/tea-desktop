# ADR 0036: Provider-Neutral Message Search

## Status

Accepted

## Context

Tea needs both channel-scoped and enterprise-wide message search. Yunxin's
cloud search API groups results by conversation and uses opaque page tokens.
Those SDK response groups, tokens, and message DTOs must not cross into the
renderer because the IM provider may later be replaced by a native N-API
adapter.

## Decision

`ChannelTransport.searchMessages` accepts a trimmed keyword, an optional
`channelRef`, a bounded page size, an opaque cursor, and a direction. It returns
flat provider-neutral `Message` items, a total count, `hasMore`, and an opaque
`nextCursor`. The Yunxin adapter maps `searchCloudMessagesEx` groups into this
shape and remembers raw messages locally so a search result can be used as a
history anchor without exposing provider objects.

The channels store owns search request concurrency, stale-result rejection,
pagination, result projection, and jump-to-message highlighting. Components
only open the search surface, submit keywords, request another page, and emit a
selected result. A missing channel scope means all conversations; a scoped
search only sends that channel reference to the provider.

## Error and recovery

Keywords, cursors, and page sizes are bounded at the transport boundary. A
provider response without a valid next token is treated as terminal even if it
claims that more results exist. Transport and protocol failures use the normal
`ChannelTransportError` codes, and a stale request cannot overwrite newer
search state after a channel/account lifecycle change.

## Consequences

The Electron IPC command and preload allowlist carry only serializable search
requests and results. A future N-API implementation needs only to implement
the same transport method and can choose its own native search API or local
index while preserving the renderer contract.

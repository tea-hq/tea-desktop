# ADR 0038: Provider-Neutral Saved Message Catalog

## Status

Accepted

## Context

Saved messages are private, cross-channel, durable user facts. They differ from
channel pins, which are shared channel facts, and from the renderer message
projection, which can be cleared or replayed. Yunxin exposes saved data as
message collections whose records, anchors, serialization utilities, and error
codes are provider-specific. Tea may replace the Web SDK with a native N-API
adapter without changing feature stores or components.

The Yunxin UI Kit already writes message collections with
`collectionType = messageType + 1000` and a JSON payload containing a serialized
message plus source display metadata. Tea needs to interoperate with those
records while making its own persisted format explicit and versioned.

## Decision

`ChannelTransport` exposes provider-neutral `saveMessage`, `listSavedMessages`,
and `removeSavedMessage` methods. A `SavedMessage` contains an opaque saved id,
a provider-neutral message snapshot, a saved timestamp, and an optional source
channel name. Pagination uses a bounded page size and opaque cursor. Yunxin
collection DTOs never cross Electron IPC.

The Yunxin adapter is the collection source-of-truth owner. It uses message
collection types `1000..1100`, serializes and deserializes raw messages through
`V2NIMMessageConverter`, and stores this version-1 envelope:

```json
{
  "schema": "tea.saved-message",
  "version": 1,
  "message": "<Yunxin serialized message>",
  "conversationName": "<optional source name>",
  "senderName": "<optional sender name>",
  "avatar": "<optional sender avatar>"
}
```

All strings and the complete payload are bounded. The adapter also reads the
released Yunxin UI Kit envelope with the same fields but no schema/version.
Unknown Tea schemas or versions are not guessed and are omitted from the
catalog. Provider collection ids are opaque cursors and removal handles only
after the current transport has resolved them to account-scoped collection
records.

The channels store owns request concurrency, stale-result rejection, catalog
deduplication, mutation state, and stable errors. Saved snapshots survive source
message deletion and history clear. Account change, transport replacement,
disconnect, and disposal clear the renderer projection and invalidate old
cursors. Components render catalog states and emit navigation, forwarding,
Agent staging, and removal intents; they do not call IPC or provider APIs.

## Error and recovery

- Invalid sizes, cursors, ids, and unknown removal handles use
  `invalidRequest`.
- Yunxin collection limit error `189301` maps to non-retryable
  `limitExceeded`.
- Provider call failures map to retryable `transport`.
- Structurally invalid provider pages or failed removal counts map to
  `protocolFailure`.
- Malformed or unsupported collection records are omitted so one bad record
  cannot make the whole private catalog unavailable. Pagination still advances
  over the raw provider page.
- A late page or mutation cannot write into a different transport/account
  lifecycle. Reloading the catalog obtains fresh anchors and is the normal
  recovery path.

## Versioning, migration, and rollback

Version 1 is the persisted compatibility boundary for Tea-authored Yunxin saved
messages. A future payload change requires a new version plus an explicit
adapter migration that is tested against existing version-1 records. Tea will
not dual-write versions or silently reinterpret unknown data. Version 1 cannot
be deprecated until the migration has completed and rollback readers can still
recover every migrated record.

A Yunxin native N-API adapter must implement the same `ChannelTransport`
contract and preserve the version-1 converter semantics before it can replace
the Web SDK. Because the standard `message`, `conversationName`, `senderName`,
and `avatar` fields remain present, the existing Yunxin UI Kit can still read
Tea-authored records. Rolling back from N-API to Web is data-safe as long as the
native adapter has not written a newer payload version.

## Testing consequences

Codec tests cover versioned and UI Kit payloads, bounds, malformed data, and
stable identity. Adapter tests cover idempotent save, pagination, deletion,
provider error mapping, and DTO containment. Store tests cover append dedupe,
mutation projection, and stale lifecycle responses. Component and browser
checks cover localized accessible controls and 1280px/390px layouts.

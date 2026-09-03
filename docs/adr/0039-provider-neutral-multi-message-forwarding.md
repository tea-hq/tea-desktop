# ADR 0039: Provider-Neutral Multi-Message Forwarding

## Status

Accepted

## Context

Tea needs complete multi-message selection, individual forwarding, merged
forwarding, and nested chat-history viewing. The released Yunxin UI Kit already
defines an interoperable merged-message format: a custom type-101 card points to
an uploaded `mergedMsgs.txt` archive whose first line is metadata and whose
remaining lines are produced by `V2NIMMessageConverter.messageSerialization`.
Tea may replace the Yunxin Web SDK with a native N-API adapter, so raw messages,
converter objects, upload handles, and custom payloads cannot become renderer
contracts.

Forwarding to a direct conversation must preserve the enterprise directory
invariant. Tea Center owns contacts, Yunxin owns groups and group members, and
every direct target must be a known Center contact. The Yunxin adapter checks
friendship and adds a missing friend with no-consent mode before sending.

## Decision

`ChannelTransport` exposes a provider-neutral `ForwardMessageRequest` with
ordered `messageRefs`, ordered `targetChannelRefs`, an `individual` or `merged`
mode, optional source display name and comment, and an optional idempotency key.
It also exposes `loadMergedMessages`, which returns ordinary provider-neutral
`Message` snapshots. A merged card is a `MessageContent` variant containing only
its source display name, up to three bounded abstracts, and nesting depth.

Shared domain rules enforce these limits and content sets:

- At most 100 source messages from one conversation and 50 target conversations.
- Individual forwarding accepts text, image, file, and video messages.
- Merged forwarding accepts text, image, file, audio, video, call, and nested
  merged messages whose resulting depth is at most three.
- An optional comment is a separate text message sent after the forwarded
  content; it is never embedded into the archive.

The Yunxin Web adapter alone owns type `101`, message conversion, archive
upload/download, MD5, remote URL policy, and legacy provider normalization. It
serializes one immutable archive and reuses that upload across all targets.
Archive content is UTF-8, bounded to 5 MiB, fetched only over HTTPS with a
15-second timeout, checked against its MD5 before parsing, and deserialized only
through the SDK converter. Deserialized raw messages remain adapter-private so
nested cards and saved snapshots can be forwarded again.

The channels store owns request state, lifecycle generation, stable errors, and
late-result rejection. Selection and nested-view use cases own ephemeral UI
state. Components render that state and emit intent; they do not parse archives,
call IPC, or branch on runtime/provider names.

## Failure, idempotency, and recovery

Validation and direct-recipient friendship preparation complete for every
target before the first provider send. This prevents a known invalid target
from creating a partially forwarded operation. Once sends begin, provider
operations are not transactional across targets: a later failure can leave
earlier messages delivered. Tea returns failure, preserves the dialog and
selection, and retries with the same operation idempotency key. Transports cache
completed results for that key so reopening a completed operation in the same
transport lifecycle does not resend it. This is not an exactly-once guarantee:
the cache is not durable across process restart, and a provider acceptance whose
client acknowledgement is lost is ambiguous. Retrying such a partial or
ambiguous failure can duplicate messages already accepted by the provider. Tea
must expose the failure and never claim transactional completion; provider send
failures keep their stable retryable `transport` code.

Invalid source/target counts, mixed source conversations, missing messages,
unsupported content, revoked messages, and nesting overflow use stable request
errors before upload or send. Invalid type-101 payloads, non-HTTPS URLs,
oversized archives, checksum mismatch, malformed metadata, or converter failure
use stable protocol/archive errors. Viewer failure is isolated to the current
card and supports retry, back, or close. Account change, transport replacement,
disconnect, and disposal invalidate outstanding forwarding and archive-loading
results.

## Versioning, migration, and rollback

The Yunxin archive and custom-card format is an external compatibility boundary,
not a Tea renderer schema. Tea writes the released UI Kit line format and reads
its numeric legacy message-type normalization. A format change requires a
versioned adapter codec, fixtures for the previous format, an explicit migration
and rollback reader, and proof that existing UI Kit clients can still open
Tea-authored cards. Tea will not dual-write or guess unknown archive versions.

A native N-API adapter must implement the same `ChannelTransport` contract,
limits, error codes, converter semantics, type-101 payload, checksum, and event
ordering. Vue, stores, Electron IPC contracts, and selection/viewer use cases do
not change. Rollback to the Web adapter is safe while the N-API adapter continues
to write the established archive/card format.

## Testing consequences

Pure rule tests cover limits, whitelists, state, and depth. Both transport
implementations cover multi-target individual/merged forwarding, comments,
idempotency, deleted-source snapshots, and nested loading. Yunxin codec tests
cover exact line serialization, legacy normalization, URL/size/time bounds, MD5,
and malformed archives. Electron/store tests cover allowlisting and stale
lifecycles. Component and browser fixtures cover selection, mode eligibility,
multiple targets, loading, error/retry, nested records, and English/Chinese
desktop and 390px layouts.

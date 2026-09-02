# ADR 0040: Durable IM Channel Drafts

- Status: Accepted
- Date: 2026-09-03

## Context

Human-authored IM composer text was owned by `ChannelTimeline` and disappeared
when a Channel component or the desktop process closed. Tea also has persisted
Agent-generated Channel drafts, but those belong to the conversation runtime,
source review, versioning, and delivery state machine. Reusing them for human
composer input would join two unrelated owners.

Tea currently uses the Yunxin Web SDK and may replace it with a native N-API
adapter. Draft behavior therefore cannot depend on a provider conversation
object, SDK storage API, or renderer persistence.

## Decision

Add a provider-neutral `ChannelDraftClient` beside `ChannelTransport`. Its
identity is `(accountRef, channelRef)` and its values contain only text,
validated mention target/label/range metadata, and `updatedAt`. Attachment
picker tokens are short-lived main-process handles and are never part of a
draft.

Electron main owns `im-channel-drafts.json` through `JsonStore`. Schema version
1 stores a bounded array under `data.drafts`. Writes are serialized and use an
atomic temporary-file rename. The service updates its in-memory catalog only
after the durable write succeeds. Limits are 8 MiB for the catalog, 2,000
drafts, 64 KiB text per draft, 100 mentions per draft, 201 characters per
mention label, and 100 ranges per mention. Identifiers are bounded to 512
characters. Mention ranges must be integer JavaScript string offsets that
match the persisted label.

The context-isolated bridge allowlists list, save, and remove commands. The
Electron adapter and an in-memory preview adapter implement the same port.
Neither the port nor the store imports Yunxin types.

The channel store owns loading and UI projection. It loads only after a
connected status exposes `accountRef`, clears the old projection before an
account change, coalesces edits for 300 ms, serializes writes per Channel, and
flushes before Channel switches, disconnect, and disposal. A write failure
keeps the in-memory draft and sets a stable error code; later input can retry.
Send failure preserves the draft. The draft is removed only after all requested
text and attachment sends finish successfully.

`ChannelTimeline` is controlled: it renders draft state and emits user intent.
It retains only ephemeral mention-menu navigation. `ChannelSidebar` projects a
localized Slack-style Draft label and trimmed preview without becoming a fact
store.

## Versioning And Recovery

Version 1 is the initial pre-1.0 persisted contract. Before 1.0, an incorrect
schema is replaced directly rather than supported through aliases, duplicate
readers, or fallback state machines. A future schema change must define its
own one-way migration, capacity impact, and rollback behavior before changing
the version.

Missing files mean an empty catalog. Invalid JSON, oversized files, and unknown
schema versions are renamed to a timestamped `.corrupt.json` file by
`JsonStore`, then recovered as an empty catalog. Invalid rows inside an
otherwise valid catalog are ignored; valid rows remain available. Rollback to
code that does not know this catalog leaves the file untouched. Rolling back
after a future schema migration requires restoring the preserved prior file or
an explicitly documented reverse migration; the application must never guess.

No cloud sync is part of version 1. If sync is added later, a completed local
write remains successful even when upload fails, matching Tea's durable-state
invariant.

## Consequences

- Replacing Yunxin Web with N-API changes the transport adapter, not draft
  persistence, store behavior, or Vue components.
- Accounts cannot observe one another's local draft projection.
- Text survives desktop restart while expiring attachments must be selected
  again.
- JSON catalog reads are linear but bounded; a future scale-driven storage
  change requires a versioned migration rather than an implicit replacement.

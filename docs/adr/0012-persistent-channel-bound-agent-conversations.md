# ADR 0012: Persistent Channel-Bound Agent Conversations

- Status: Accepted
- Date: 2026-08-22
- Supersedes: ADR 0009 and ADR 0010

## Context

ADR 0009 reused `ConversationRuntime` for one-shot Channel `AgentTask` runs,
but deliberately omitted those conversations from the durable catalog. ADR
0010 added a task-and-anchor-scoped Channel history tool. The resulting flow
can generate one reviewed Draft, but it cannot preserve all Channel
collaboration, continue for multiple turns, stage several references, or
recover after application restart.

Tea Desktop already has one durable Conversation catalog and one runtime port
for built-in Tea, Claude Code, and Codex. Extending `AgentTask` into a second
conversation aggregate would duplicate catalog, event reduction, cancellation,
approval, recovery, and selection state.

The Channel provider currently runs in the WebView. Channel messages remain
provider facts exposed through `ChannelTransport`; tokens and SDK objects must
not cross into Conversation persistence or Agent context.

## Decision

### One Conversation Aggregate

Use the existing durable Conversation as the only Agent collaboration
aggregate. A Conversation has an optional immutable `ChannelBinding` containing
transport id, an opaque account scope, and `ChannelRef`. Unbound conversations
remain local. A Channel may have multiple bound conversations.

All conversations enter one catalog. Catalog requests support backend filters
for all, local, any Channel, and one exact binding so pagination remains
correct. `ConversationPurpose::ChannelTask` and the frontend `AgentTask`
aggregate are removed directly; no compatibility alias or second catalog is
retained.

### Host-Owned Collaboration Records

The Tauri conversation host persists sanitized Channel source snapshots,
versioned Drafts, and Delivery attempts. Runtime snapshots remain
authoritative for turns. Since the three runtimes use different native turn
identities, collaboration records correlate with the stable zero-based turn
ordinal captured from the runtime snapshot before dispatch. Conversation
runtimes remain product-neutral and receive no Channel DTO.

The host accepts a visible user instruction and bounded source inputs. It
persists the collaboration turn context before runtime dispatch, then builds a
bounded Agent prompt outside Vue. On restore, it joins source records to the
runtime snapshot by turn ordinal and restores the visible instruction.

### Conversation-Bound History Tool

Retain the generic `ConversationRuntime` host-tool protocol. Replace the fixed
task anchor with an immutable Conversation binding scope. A source-free turn
may request a recent bounded page; subsequent calls may page only with
host-issued message references returned in that turn. Existing call, message,
character, depth, queue, and timeout limits reset per turn.

While Channel facts remain in the WebView, a collaboration use case executes
tool calls through `ChannelTransport` and records returned sources through
`ConversationClient`. Tool definitions and broker scopes are configured before
each turn and closed on terminal events or cancellation. A future
`TauriChannelTransport` changes only the executor.

### Explicit Draft Delivery

Agent responses remain ordinary Conversation output. A user explicitly creates
a Draft from one completed assistant block. Draft edits create versions.

Before provider send, the host creates a durable Delivery with a stable
idempotency key derived from Conversation, Draft, and version. The WebView use
case sends through `ChannelTransport` and then records the provider
`MessageRef`. Repeated confirmation of a sent version returns the existing
Delivery. A Delivery left in `sending` after interruption is reconciled from
bounded recent Channel history; if it cannot be proven sent, it becomes an
uncertain typed failure and is not automatically resent.

## Alternatives Considered

### Extend `AgentTask`

Rejected because it duplicates the existing Conversation lifecycle and durable
catalog.

### Add A Collaboration Wrapper Around Conversation

Rejected because two durable ids would create competing recovery and selection
facts without confirmed variation.

### One Endless Conversation Per Channel

Rejected because unrelated Channel topics would accumulate in one runtime
context. Multiple immutable bindings keep topic history coherent.

### Cross-Channel Binding

Deferred because it adds mixed authorization, provenance, and Delivery target
selection. People bring cross-Channel evidence into the bound Channel through
provider forwarding.

### Runtime-Specific Turn Correlation

Rejected because it would require product-specific changes in `tea-rs`, Claude
Code, and Codex protocols. Ordered snapshot position is already common to all
three runtimes and is sufficient while one turn at a time is enforced.

## Consequences

### Positive

- Channel collaboration becomes durable, multi-turn, searchable, and
  recoverable through one existing catalog.
- Tea, Claude Code, and Codex continue through the same runtime abstraction.
- Channel reads remain bounded and auditable; writes remain human-reviewed.
- Compact and full UI views share one authoritative projection.
- Future Rust Channel transport adoption does not change product contracts.

### Negative

- The conversation catalog gains schema migration and collaboration tables.
- Turn-ordinal correlation depends on ordered runtime snapshots and one active
  turn per conversation.
- Current WebView execution requires a frontend host-tool executor and a
  two-phase Delivery bridge.
- A crash between provider send and Delivery completion may require bounded
  reconciliation and can end in a conservative uncertain state.

### Neutral

- Runtime selection remains immutable for a Conversation.
- Existing process-local AgentTask history has no durable migration source and
  is discarded when the legacy projection is removed.

## Migration

Add nullable binding columns and normalized collaboration tables through one
transactional SQLite schema migration. Existing catalog rows remain local
conversations. Back up an existing catalog before the first migration attempt.
Do not migrate process-local AgentTask state.

Replace the experimental `channelTask` purpose and legacy frontend contracts
directly. This repository has no released compatibility commitment requiring a
parallel state machine.

## Rollback And Recovery

Rollback disables Channel collaboration UI and leaves new normalized tables in
place; it does not perform a destructive down migration. Existing local
Conversation rows remain readable.

On restart, runtime snapshots restore turns and the catalog restores bindings,
sources, Drafts, and Deliveries. Pending tool calls fail closed. Interrupted
runs become runtime snapshot state or typed interruption. Pending Deliveries
are never blindly resent.

## References

- `docs/design/channel-bound-agent-collaboration.md`
- `docs/adr/0005-conversation-catalog-and-runtime-recovery.md`
- `docs/adr/0008-real-channel-transport.md`

# Channel-Bound Agent Collaboration

- Status: Confirmed design
- Date: 2026-08-22
- Scope: Tea Desktop Channel and Agent workspaces
- Replaces as target design: process-local, single-run Channel `AgentTask`

## Summary

Tea Desktop will replace one-shot Channel Agent tasks with persistent,
multi-turn Agent conversations that are permanently bound to one Channel
account scope and one `ChannelRef`.

A Channel may have multiple Agent conversations organized by topic. The same
conversation appears in the Channel side panel and the full Agent workspace.
Users can stage referenced Channel messages, add a local instruction, continue
the conversation across multiple turns, let the Agent query bounded Channel
history, create an editable Draft from a selected Agent response, and manually
approve delivery back to the bound Channel.

The existing Conversation runtime abstraction remains the only execution path
for built-in Tea, Claude Code, and Codex. `ChannelTransport` remains the source
of truth for Channel messages. The design does not introduce another runtime,
conversation catalog, or provider-specific UI state machine.

## Problem

The current Channel collaboration flow treats each selected message as a
single `AgentTask`. It creates one hidden `purpose: channelTask` runtime
conversation, produces one Draft, and stores the task projection only in
frontend memory. Users cannot reliably find old work, continue a multi-turn
discussion, combine several references before starting, or resume after an
application restart.

This recreates the manual workflow that Tea Desktop should remove:

1. Copy messages from a Channel.
2. Paste them into an Agent application.
3. Conduct several local turns.
4. Copy the final result back to the Channel.

The target invariant is:

> A Channel-bound Agent conversation is one durable collaboration space. It
> keeps local dialogue and cited Channel evidence together while all Channel
> writes remain explicit, reviewed, and provider-authoritative.

## Confirmed Product Decisions

1. One Channel may own multiple Agent conversations, organized by topic.
2. A Channel-bound conversation is permanently bound to one transport account
   scope and one `ChannelRef`.
3. Cross-Channel evidence and delivery are out of scope. People resolve
   cross-Channel context by forwarding messages through the Channel provider.
4. All conversations use one durable catalog. Local and Channel-bound
   conversations are filters over the same catalog, not separate stores.
5. Forwarding a Channel message opens a conversation chooser. The message is
   staged in the Agent composer and does not invoke the Agent immediately.
6. Users may stage several messages from the same Channel, add an instruction,
   and submit them as one turn.
7. A Channel-bound conversation may also receive a source-free local prompt.
8. The Agent may query the entire bound Channel through a bounded, read-only
   host tool. No history is automatically preloaded.
9. Normal Agent responses are not Drafts. A user explicitly creates a Draft
   from a selected Agent response.
10. Draft delivery always requires human confirmation and targets only the
    bound Channel.
11. The Channel side panel is the compact collaboration view. The Agent
    workspace is the full view of the same `conversationId`.
12. `runtimeId` is fixed when a conversation is created. Changing Tea, Claude
    Code, or Codex creates a new conversation.
13. Referenced Channel messages retain a bounded local snapshot and their
    stable `MessageRef`. Provider updates remain authoritative for current
    message state.

## Goals

- Persist and list all local and Channel-bound Agent conversations.
- Continue multi-turn work in a Channel-bound conversation after restart.
- Stage one or more same-Channel message references before invoking an Agent.
- Support source-free local turns in a Channel-bound conversation.
- Let the Agent query bounded history from only the bound Channel.
- Make all acquired Channel evidence visible and auditable.
- Derive multiple editable Drafts from Agent responses.
- Deliver a reviewed Draft idempotently through `ChannelTransport`.
- Preserve one runtime and one event projection for Tea, Claude Code, and
  Codex.
- Keep future `TauriChannelTransport` adoption transparent to stores and Vue.

## Current Boundaries

- One conversation that switches between Agent runtimes.
- Background autonomous monitoring of a Channel.
- Sharing one local Agent conversation among multiple desktop users.

The enterprise IM target includes the complete UIKit message surface: media
attachments, voice and video, locations, custom/robot/call/notification
messages, search, forwarding (including ordinary cross-Channel forwarding and
forwarding to an Agent), replies, mentions, reactions, pins, collections,
read details, and group/contact management. Binary upload/download and
provider mutations remain behind typed transport capabilities and are never
implemented in Vue components.

## Domain Model

### Conversation

`Conversation` remains the durable Agent collaboration aggregate. A new
optional binding distinguishes Channel collaboration from local conversation.

```ts
interface ChannelBinding {
  transportId: string
  accountRef: string
  channelRef: ChannelRef
}

interface ConversationSummary {
  conversationId: string
  runtimeId: string
  workspaceId: string
  channelBinding?: ChannelBinding
  title?: string
  lastMessagePreview?: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}
```

`transportId` comes from `ChannelTransport.descriptor().id`. `accountRef` is a
provider-neutral, opaque account scope produced by Channel composition. It
must distinguish provider application namespace and account without storing a
token or other credential. A provider account name alone is not sufficient.

The binding is immutable. Rebinding would make prior tool evidence and Draft
delivery ambiguous. A user who needs a different binding creates a new
conversation.

### Conversation Turn

A `ConversationTurn` owns one local prompt and its runtime lifecycle. Existing
ordered runtime events remain authoritative for working, approval, failure,
cancellation, and completion.

The current `AgentTask` aggregate will not become a second persistent
conversation. Its run status and activity projection move to the owning turn.
Pure local turns and turns with Channel sources therefore use the same reducer
and recovery path.

### Channel Source

A `ChannelSource` records evidence admitted to a conversation.

```ts
type ChannelSourceOrigin = 'userForwarded' | 'agentTool'
type ChannelSourceState = 'active' | 'modified' | 'revoked' | 'deleted'

interface ChannelSource {
  sourceId: string
  conversationId: string
  turnId: string
  messageRef: MessageRef
  origin: ChannelSourceOrigin
  snapshot: {
    senderName: string
    sentAt: number
    sentByCurrentUser: boolean
    text: string
    capturedAt: number
  }
  state: ChannelSourceState
  latestText?: string
  lastObservedAt?: number
}
```

The snapshot is bounded and sanitized. It excludes SDK objects, provider
extensions, receipts, reactions, credentials, attachment bytes, and logs.
`ChannelTransport` remains authoritative for current state. If a source is
later modified, revoked, or deleted, `latestText` and `lastObservedAt` project
the latest provider observation while the source card preserves the captured
snapshot. Revoked and deleted sources expose no new provider text. This does
not rewrite what the Agent had already observed in an earlier turn.

Staged sources are ephemeral composer state until the user submits a turn.
Submission persists the sanitized sources before dispatching the runtime
prompt. Duplicate `MessageRef` values in one composer are ignored.

### Draft And Delivery

A Draft is an editable, versioned result derived from one Agent response. It is
not the Agent response itself.

```ts
interface Draft {
  draftId: string
  conversationId: string
  sourceTurnId: string
  currentVersion: number
  content: string
  createdAt: number
  updatedAt: number
}

interface Delivery {
  deliveryId: string
  draftId: string
  draftVersion: number
  channelBinding: ChannelBinding
  idempotencyKey: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  sentMessageRef?: MessageRef
  failureCode?: string
  createdAt: number
  updatedAt: number
}
```

One conversation may produce many Drafts. Editing a Draft increments its
version. A Delivery always records the exact reviewed version. Its stable
idempotency key derives from conversation, Draft, and version identity. A sent
Delivery cannot be sent again by repeated confirmation.

## Ownership And Dependency Direction

```text
Channel and Agent Vue views
          |
          v
collaboration store / use cases
      |                   |
      v                   v
ConversationClient    ChannelTransport
      |                   |
      v                   v
Tauri IPC adapter     YunxinWebChannelTransport
      |                   |
      v                   v
conversation host       provider SDK
      |
      v
ConversationRuntime
  |        |          |
 Tea   Claude Code   Codex
```

The collaboration feature is the cross-domain application use case. It may
coordinate `ConversationClient` and `ChannelTransport`; it must not coordinate
two Pinia stores by calling one store from another.

- Vue renders projections and emits user intent only.
- The collaboration store owns selection, source staging, request state, and
  the compact/full-view projection.
- The Tauri conversation host owns durable Conversation metadata, source
  snapshots, Draft versions, Delivery records, runtime subscription, recovery,
  and tool-call scope.
- `ConversationRuntime` owns native Agent session lifecycle and ordered runtime
  facts. It remains product-neutral and receives no Channel DTOs.
- `ChannelTransport` owns current Channel and Message facts and all provider
  writes.
- A Desktop application service converts sanitized Channel sources into a
  bounded runtime prompt. Vue never concatenates Channel history.

## Catalog And Persistence

The existing SQLite conversation catalog becomes the single catalog for both
local and Channel-bound conversations.

Backend filtering is required for correct pagination:

```ts
type ConversationScopeFilter =
  | { kind: 'all' }
  | { kind: 'local' }
  | { kind: 'channel' }
  | { kind: 'binding'; binding: ChannelBinding }
```

The full Agent workspace uses `all`, `local`, or `channel`. The Channel side
panel uses an exact `binding` filter. Filtering an already paginated frontend
page is not acceptable because it can hide available results and corrupt
`hasMore` behavior.

The persistence schema adds normalized tables for immutable bindings, source
snapshots, Drafts, Draft versions, and Deliveries. Conversation deletion
cascades to those records. Existing local conversations remain unbound.

The unreleased process-local `AgentTask` projection has no durable records to
migrate. `ConversationPurpose = 'channelTask'` is removed rather than retained
as a compatibility alias. Optional `ChannelBinding`, not purpose, determines
catalog visibility and capability.

Schema migration runs transactionally and retains a pre-migration database
backup until the new schema opens successfully. Rollback disables the new
feature and preserves new tables; it does not attempt a destructive down
migration. Recovery from a corrupt collaboration record isolates that record
and keeps the rest of the catalog readable.

## User Flows

### Create A Channel-Bound Conversation

1. The user opens a Channel side panel and selects New collaboration.
2. The user selects one ready runtime.
3. The application creates a cataloged Conversation with the current immutable
   `ChannelBinding`.
4. The empty conversation is immediately available in the Channel side panel
   and the Agent workspace catalog.
5. Runtime selection is fixed for all subsequent turns.

### Forward Channel Messages To An Agent

1. A Channel message action emits only its `MessageRef`.
2. A chooser lists recent conversations with the exact current binding and a
   New collaboration command.
3. Selection opens the Channel side panel and stages a sanitized source card.
4. The user may stage more same-Channel sources, remove sources, and edit an
   instruction.
5. Submit persists the turn request and source snapshots, then invokes the
   conversation runtime.
6. The initial Agent input includes only the user instruction and staged
   sources. It does not include an automatically chosen history window.

### Pure Local Collaboration

The user may submit a prompt without staged sources. The runtime receives the
conversation's existing local history. When Channel evidence is necessary, it
may call the scoped history tool. If the correct Channel account is not
connected, the tool returns a typed unavailable result while local dialogue
remains usable.

### Continue In The Full Agent Workspace

The Expand command navigates to the Agent workspace with the same
`conversationId`. It does not create or copy a conversation. Returning to the
Channel workspace restores the prior Channel, selected message, scroll
position, staged sources, and side-panel conversation selection.

### Create And Deliver A Draft

1. A completed Agent response offers Create Channel Draft.
2. The user edits the new Draft independently of the response.
3. Confirm send shows the exact content and bound Channel.
4. The use case persists a pending Delivery before calling
   `ChannelTransport.sendMessage()`.
5. The send request carries versioned Agent identity, `conversationId`,
   `draftId`, Draft version, Delivery id, and idempotency key in the bounded
   server extension.
6. Success stores the provider `MessageRef` and marks the Delivery sent.
7. The UI may navigate to the corresponding Channel message.

## Channel History Tool

ADR 0010's host-tool boundary remains valid, but its task-and-anchor scope is
replaced by immutable Conversation binding scope.

The read-only tool supports:

- paging before or after a known `MessageRef`;
- reading a bounded recent or time-range page in the bound Channel;
- continuing only with host-issued cursors from the same conversation scope.

The history tool remains read-only: it cannot send, modify, delete, pin, react,
mark read, or address another Channel. Structured content is exposed only as
bounded safe text and attachment metadata; binary bytes and provider payloads
never enter Agent input. Full message search and mutation workflows are
separate typed use cases over the same provider-neutral contracts.

The current ADR 0010 limits become per-turn limits: at most 6 calls, 10
messages per call, 40 unique references, 32,000 returned message characters,
one pending call, and a 10-second deadline. Tool argument and result depth and
byte limits remain enforced. Time-range requests are additionally bounded to
24 hours per call. These bounds may change only through an ADR and contract
tests.

Every returned message that influences a turn is persisted as an `agentTool`
source. Tool calls and source cards expose query range, result count, and typed
status, not model reasoning or provider SDK payloads.

While Channel facts live in the WebView, the existing restricted frontend
executor may fulfill host calls through `ChannelTransport`. Moving to
`TauriChannelTransport` replaces that executor without changing Conversation,
source, Draft, Delivery, store, or component contracts.

## UI Design

### Channel Side Panel

The compact panel shows one active conversation at a time:

- header: title, runtime, run status, conversation switcher, New, and Expand;
- empty state: recent conversations for this binding and New collaboration;
- body: compact multi-turn history with expandable source citations;
- composer: local instruction plus a deduplicated staged-source tray;
- Draft mode: focused editor, version state, review, and send confirmation.

The panel does not render all historical conversations and all Drafts at once.
History lives in the switcher; the active conversation owns the body.

### Agent Workspace

The existing catalog adds All, Local, and Channel filters. Channel-bound rows
show Channel identity and runtime identity without replacing either. The full
conversation view exposes complete turns, source citations, host-tool
activity, approvals, Draft history, and Delivery history.

Both views subscribe to one conversation projection. Selection and ephemeral
layout state may differ, but durable turns, sources, Drafts, and Deliveries
must never be duplicated.

## Capability Model

The UI derives commands from authoritative capabilities rather than assuming
availability:

- runtime `prompt`, `events`, `snapshot`, and `hostTools`;
- collaboration `channelHistoryRead`, `sourceRefresh`, and `draftDelivery`;
- Channel `message.history` and `message.send.text`.

A Channel-bound conversation may continue local dialogue when Channel
capabilities are unavailable. Source refresh, history queries, and delivery
show a typed unavailable state. Components do not synthesize successful tool
results or sent messages.

## Failure And Recovery

| Failure                                      | Required behavior                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Application exits during a run               | Recover from runtime snapshot; otherwise mark the turn interrupted and allow a new retry turn.     |
| Channel disconnects                          | Keep local history usable; disable source refresh, history reads, and Delivery.                    |
| Token expires or account is kicked           | Close pending tool scopes, fail pending calls with a typed error, and require reconnection.        |
| Different account connects                   | Reject Channel access unless the opaque account scope exactly matches the binding.                 |
| Source is modified                           | Refresh current state and visibly distinguish the captured snapshot from the latest provider text. |
| Source is revoked or deleted                 | Show a tombstone while retaining the audit fact that earlier Agent input contained a snapshot.     |
| Tool result is late or duplicated            | Ignore it using call identity and terminal scope state.                                            |
| Runtime stream is duplicated or out of order | Use canonical sequence reduction and snapshot recovery.                                            |
| Delivery times out                           | Check durable Delivery state and provider result mapping before permitting retry.                  |
| User confirms twice                          | Return the existing sent Delivery and never call provider send twice.                              |
| Conversation is deleted                      | Cancel active work, close tool scopes, and cascade local sources, Drafts, and Deliveries.          |

## Security And Privacy

- Tokens remain in the OS credential facility and WebView memory only during
  login. They never enter Conversation metadata, source snapshots, prompts,
  logs, Drafts, or Agent tools.
- `accountRef` is opaque and non-secret. Raw provider credentials are never
  persisted in the binding.
- All source text, user prompts, Agent output, tool arguments, Drafts, and
  server extensions have explicit byte and nesting limits.
- Channel history tools are read-only and scoped outside model-visible
  arguments. The model cannot choose transport, account, or Channel.
- Provider DTOs and SDK enums remain inside the transport implementation.
- Logs contain stable ids, counts, statuses, and error codes, not message text
  or Draft content.
- Deleting a Conversation removes its local source snapshots. Provider data is
  unaffected.
- Revoking a provider message cannot retroactively remove text already sent to
  an Agent runtime. The UI communicates that fact instead of implying erasure.

## Non-Functional Requirements

### Performance And Bounds

- Conversation catalog and exact-binding queries are indexed and paginated.
- The initial catalog page remains capped at the existing application limit;
  no view loads all conversations eagerly.
- The staged source tray accepts at most 20 unique messages per turn.
- Source and tool limits prevent unbounded prompt construction.
- Draft content cannot exceed the active Channel text-send limit, currently
  8,000 characters for `YunxinWebChannelTransport`.
- Runtime and host-tool event queues remain bounded. Overflow triggers snapshot
  recovery or a typed terminal failure, never silent state divergence.

### Reliability

- Conversation metadata, submitted sources, Draft versions, and Delivery
  state use transactional local persistence.
- A submitted turn is durable before runtime dispatch.
- A pending Delivery is durable before provider send.
- Runtime and provider duplicate events are idempotently reduced.
- No working, sending, or pending state remains indefinitely after restart.

### Maintainability

- No runtime-name branching appears in Vue, stores, or collaboration use cases.
- No provider-name branching appears outside transport composition and the
  concrete transport.
- All IPC requests, responses, events, bindings, sources, Drafts, and
  Deliveries are serializable and versioned before release.
- Browser preview uses fakes implementing the same Conversation and Channel
  boundaries.

## Testing And Acceptance

### Rust Domain And Persistence

- create local and bound conversations;
- reject binding changes and account-scope mismatches;
- catalog pagination for all, local, Channel, and exact binding filters;
- persist and restore turns, sources, Draft versions, and Deliveries;
- transaction failure, corrupt record isolation, cascade deletion;
- interrupted run and pending Delivery recovery;
- duplicate, stale, and out-of-order runtime events.

### IPC And Adapter Contracts

- DTO serialization and protocol version checks;
- frontend-to-host source sanitization and size bounds;
- host-tool scoping, cursor validation, quotas, timeout, cancellation, and late
  results;
- `ChannelTransport` send mapping and provider `MessageRef` retention;
- same idempotency key returns the same Delivery result.

### TypeScript Store And Use Cases

- exact-binding chooser contents;
- source staging, removal, ordering, and deduplication;
- source-free and source-backed turn submission;
- compact and full views project the same conversation;
- Channel disconnect, reconnect, kicked-offline, and account switch;
- Draft creation from a selected Agent response, editing, versioning, review,
  send failure, retry, and duplicate confirmation;
- unsupported runtime and Channel capabilities.

### Vue Interaction

- forward action opens the chooser and never invokes immediately;
- selecting a conversation stages a visible source card;
- New creates one conversation with the selected runtime and exact binding;
- Expand and Back preserve Channel and composer UI state;
- Agent workspace filters and Channel identity render correctly;
- revoked, deleted, offline, working, failed, review, and sent states are
  visually distinct and localized.

### End-To-End Acceptance

1. Create two Agent conversations for one Channel and find both after restart.
2. Stage several Channel messages, add an instruction, and continue for
   multiple turns using Tea, Claude Code, and Codex in separate conversations.
3. Start a source-free turn and observe the Agent query only the bound Channel.
4. Expand the side-panel conversation into the Agent workspace without losing
   history or selection.
5. Create, edit, approve, and deliver a Draft; locate its provider message.
6. Repeat confirmation and verify that no duplicate provider message exists.
7. Disconnect and switch accounts; verify that local dialogue remains usable
   while Channel reads and writes are denied.
8. Modify, revoke, and delete cited messages; verify source-state projection
   without rewriting historical Agent turns.

## Alternatives Considered

### Extend `AgentTask` Into A Conversation

Rejected. It would duplicate Conversation lifecycle, catalog, runtime event
reduction, recovery, cancellation, approval, and selection state.

### Add A Separate Collaboration Session Aggregate

Rejected. The existing Conversation is already the correct durable runtime
session boundary. A wrapper would create competing identifiers and recovery
facts without confirmed variation.

### One Endless Agent Conversation Per Channel

Rejected. Long-lived Channels contain unrelated topics. Multiple bound
conversations keep runtime context coherent and let users archive completed
work.

### Cross-Channel Conversation Binding

Deferred. It adds account authorization, mixed provenance, delivery target
selection, and privacy complexity. The confirmed workflow uses provider-level
message forwarding to bring evidence into one Channel.

### Automatic Draft Creation For Every Agent Response

Rejected. Intermediate analysis and questions are not Channel-ready output.
Draft creation remains explicit.

### Immediate Invocation From The Message Menu

Rejected. Staging lets users combine sources, edit instructions, and avoid
accidental runtime work.

## Migration And Delivery Sequence

1. Record an ADR that supersedes ADR 0009's process-local AgentTask aggregate
   and ADR 0010's task-and-anchor tool scope.
2. Define versioned Conversation binding, source, Draft, Delivery, catalog
   filter, and error contracts.
3. Extend Tauri persistence and recovery before exposing frontend mutations.
4. Generalize host-tool scope from AgentTask anchor to Conversation binding.
5. Add collaboration use cases over `ConversationClient` and
   `ChannelTransport` with fake contract tests.
6. Replace the Channel AgentTask projection and single-run adapter directly;
   do not retain compatibility aliases or duplicate state machines.
7. Build the conversation chooser, source tray, compact multi-turn panel, and
   unified Agent catalog.
8. Add Draft versioning and durable idempotent Delivery.
9. Run focused checks continuously, then the full frontend and Rust suites and
   real Yunxin acceptance flows.

Implementation requires a separate tracked plan with exact files, test-first
steps, verification commands, migration handling, rollback, and recovery.

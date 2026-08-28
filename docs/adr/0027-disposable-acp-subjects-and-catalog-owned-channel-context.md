# ADR 0027: Disposable ACP Subjects And Catalog-Owned Channel Context

- Status: Accepted
- Date: 2026-08-28

## Context

ACP conversations need semantic subjects without adding a metadata prompt to
the durable Agent session. Channel-bound conversations also need to preserve
the user's visible prompt and the exact Channel messages selected for each
turn. An ACP session restored with `session/resume` may continue correctly
without replaying a snapshot, so Channel turn identity cannot depend on
counting a reconstructed ACP transcript.

The existing MCP broker already owns immutable per-conversation HostTool
scopes. Channel history results are executed by the Channel collaboration use
case and returned through that broker. Source references and delivery facts are
Desktop metadata, not ACP protocol state.

## Decision

`AcpConversationRuntime.generateSubject()` creates a disposable ACP connection
and session with no HostTools. It sends the bounded subject prompt, collects
only assistant text from ordered ACP events, requires a successful terminal
event, normalizes the result, and closes the session and connection. Subject
operations are bounded by a deterministic scheduler, coalesce duplicate
concurrent input, and are cancelled during runtime shutdown. They never enter
the runtime session registry, catalog binding, active history, model/mode
selection, or MCP scope.

The main-owned SQLite catalog stores Channel collaboration context in
normalized `conversation_turn_contexts` and `channel_sources` tables. Each
Channel-bound driving turn creates one context row even when the explicit
source selection is empty. SQLite allocates its monotonically increasing turn
index from catalog state, allowing `session/resume` to continue without
requiring `session/load` or a local ACP transcript.

The application service validates and persists the context before prompting
the runtime, wraps selected evidence as escaped JSON data, and removes the new
context if prompt dispatch is rejected. Agent-requested Channel history keeps
using the existing scoped MCP broker; the collaboration use case appends its
sanitized results to the same turn with origin `agentTool`.

Subject generation runs after an accepted first turn. A catalog
set-title-if-missing write prevents it from replacing a manual rename. Empty,
malformed, equivalent, timed-out, cancelled, or Agent-failed output leaves the
title unset and permits a later turn to retry.

## Boundaries And Failure Semantics

- Subject source is limited to 4,000 characters; normalized titles to 50.
- Raw subject output is bounded before normalization.
- Channel visible text is limited to 8,000 characters.
- A turn accepts at most 20 sources, 4,000 characters per source, and 32,000
  source characters in total.
- Source ids, sender names, timestamps, state, Channel ownership, and message
  identity are validated in Electron main before the catalog write.
- Credentials, provider extensions, ACP messages, full HostTool schemas, and
  delivery state are not persisted in conversation bindings or source rows.
- Local catalog failure prevents runtime prompt dispatch. A runtime dispatch
  failure removes only the newly allocated context. Cleanup failure preserves
  the primary stable error code.

## Alternatives

Generating the subject inside the durable ACP conversation was rejected
because it changes canonical Agent context. A private one-shot process bridge
was rejected because official ACP already provides the required session
lifecycle. Deriving Channel turn indices from ACP snapshots was rejected
because valid `session/resume` recovery does not guarantee replayable history.
An opaque collaboration JSON column was rejected because per-turn identity,
deduplication, pruning, and foreign-key cleanup are durable invariants.

## Migration And Rollback

Tea is pre-1.0, so the unreleased schema version 1 definition is replaced
directly. No compatibility reader or partial migration is added. Rollback
removes the subject capability and collaboration tables before release; ACP
bindings remain unchanged.

## Recovery

Cold recovery reattaches the exact recorded HostTool selection before
`session/load` or `session/resume`. Collaboration contexts remain readable from
SQLite independently of ACP history projection. Interrupted subject sessions
are not recovered; they are closed and may be regenerated after a later
accepted turn.

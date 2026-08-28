# ADR-0003: Ordered Conversation Turn Projection

- Status: Accepted
- Date: 2026-08-20

## Context

The first conversation UI projected assistant messages, tool activity, and
approval prompts into independent collections. Rendering each collection in a
separate region destroyed the event order of a run: all tools could appear
before one assistant response even when the agent alternated between text and
tool calls. Approval controls also remained visible after a decision because
their lifecycle was disconnected from the related tool.

Canonical runtime events already carry a conversation identifier and a
monotonic sequence. Workshop needs a UI projection that preserves those facts
without making visual state a second durable transcript.

## Decision

The frontend projects each user prompt and its resulting run into one
`ConversationTurn`. A turn contains the user prompt, terminal status, last
accepted event sequence, and one ordered list of typed blocks:

- `assistantText` contains one contiguous stream of assistant text.
- `toolCall` owns the current state of one tool invocation and any active
  approval request for that invocation.
- `failureTip` presents a typed terminal failure without impersonating an
  assistant response.

A pure reducer is the only place that converts canonical runtime events into
turn blocks. Consecutive text deltas merge into the current text block. A new
tool closes that text block and is appended at its event position. Later tool
progress updates that block in place. Text after a tool starts a new text block.
An approval is attached to its tool and its controls are removed after a
successful decision. Terminal events close all streaming and pending block
state. Duplicate or out-of-order sequence values are ignored.

The feature store owns turn state and runtime effects. Vue components only
render blocks in array order and emit approval decisions. The runtime event
stream remains authoritative; this projection is disposable and will be
rebuilt from a future snapshot/history contract rather than persisted as an
independent transcript.

## Alternatives

- Keeping independent message, tool, and approval arrays was rejected because
  their relative order cannot be reconstructed reliably at render time.
- Rendering every tool progress event as a new row was rejected because
  progress is state of one invocation, not a distinct conversation item.
- Grouping an entire run into one untyped rich-text payload was rejected because
  it would erase approval behavior and typed tool state.

## Consequences

- One visual container represents one user/agent turn while preserving the
  alternating text and tool sequence.
- Tool progress and approval decisions do not cause blocks to jump in the UI.
- Reducer tests can cover duplicate events, terminal cleanup, and ordering
  without Tauri or a live runtime.
- Snapshot recovery must eventually provide the canonical events or equivalent
  ordered run items needed to rebuild the same projection.

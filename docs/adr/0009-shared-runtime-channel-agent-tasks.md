# ADR 0009: Shared Runtime Execution For Channel Agent Tasks

- Status: Superseded by ADR 0012
- Date: 2026-08-21

> The fixed context-preload decision in this ADR is superseded by ADR 0010.
> The unified runtime, event projection, Draft review, and Channel send
> decisions remain active.

## Context

Channel messages can create an `AgentTask`, and an approved `Draft` is already
sent through `ChannelTransport` with an idempotency identity envelope. Task
creation is still a placeholder: the channels store immediately copies the
instruction into a reviewable draft instead of running an Agent.

Tea Desktop already normalizes built-in Tea, Claude Code, and Codex behind
`ConversationRuntime` and the serializable `ConversationClient` boundary. All
three ready runtimes expose prompt, event, cancellation, and snapshot behavior.
The Channel task path must reuse that boundary and must not branch on runtime
names in Vue or Pinia.

## Decision

Introduce a frontend `AgentTaskClient` port implemented as a focused adapter
over `ConversationClient`. It creates one conversation using the selected
runtime, subscribes before sending, submits one bounded task prompt, and maps
standard `ConversationEvent` values into serializable `AgentTaskEvent` values.
The existing Tea, Claude Code, and Codex runtime adapters remain unchanged.

The Channel task use case owns context acquisition. It calls
`ChannelTransport.loadMessages` around exactly one `MessageRef`, caps message
count and total text size, removes provider extensions and unrelated message
state, and builds the runtime prompt outside Vue components. This is the
restricted `loadMessages` capability for this phase; the model does not receive
the provider transport or credentials and cannot request arbitrary channels.

`AgentTask` records the selected runtime id and canonical conversation id.
Runtime events are authoritative for execution state. The channels store only
projects those events into task activities and draft text. `messageDelta`
appends draft content, `runFinished` moves a non-empty draft to review, and
`runFailed` produces a typed failed task. Cancellation delegates to the same
runtime conversation.

Conversation creation carries host-owned purpose `interactive` or
`channelTask`. In this first vertical slice, Channel task sessions are omitted
from the ordinary conversation catalog and remain process-local. Runtime
adapters do not interpret this metadata.

Draft approval remains a separate human action through `ChannelTransport`.
No runtime can send a Channel message directly. Existing versioned
`serverExtension`, idempotency key, and provider message-id retention remain the
send contract.

## Alternatives considered

Registering a native Tea tool, Claude MCP server, and Codex dynamic tool was
rejected for this phase. It would duplicate one use case across three provider
protocols when the required bounded context can be loaded before the prompt.
It remains an option only if a later requirement lets the model autonomously
page Channel history during a run.

Calling the conversation Pinia store from the channels store was rejected
because it couples two UI projections and creates competing selection and error
state. Calling Tauri commands from Channel components was rejected because Vue
must only render state and emit user intent.

## Failure and recovery

The adapter subscribes before sending and ignores duplicate or stale event
sequences. A runtime that is unavailable or lacks prompt/events is not offered
for new tasks. Context-load, conversation-create, send, runtime-failure, and
cancel errors map to stable task failures without producing a review draft.

Disconnecting or switching the Channel account cancels working tasks and clears
their in-memory projection. Review and sent tasks remain reconstructable from
the task catalog in a later recovery phase; this first vertical slice does not
automatically resume a run interrupted by process termination.

## Security and bounds

Only sender display name, timestamp, text, direction, and stable message refs
enter the task prompt. Tokens, SDK objects, extensions, reactions, receipts,
attachments, and logs are excluded. Context message count, individual text,
combined prompt size, draft size, and observed event sequence are bounded.

## Consequences

All three current runtimes participate through one tested contract. Adding a
new runtime requires implementing `ConversationRuntime`, not modifying Channel
components. The first run receives one bounded context snapshot; autonomous
history pagination is intentionally deferred.

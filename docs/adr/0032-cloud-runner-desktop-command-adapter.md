# ADR 0032: Cloud Runner Desktop Command Adapter

- Status: accepted
- Date: 2026-09-01
- Scope: Electron main, Center cloud runner API, conversation renderer

## Context

Tea Desktop already has a typed conversation command port backed by local ACP
runtimes. Cloud conversations have different ownership: Center assigns the
runner, stores the event journal, and owns cloud ACLs. Sending cloud requests
from the renderer would expose credentials and create a second conversation
state machine.

## Decision

Keep cloud transport in Electron main behind a `CloudConversationCommandService`
that composes the existing local command service. The adapter routes creation,
prompt, cancellation, listing, detail, and history by cloud conversation ID;
local commands keep their current runtime/catalog path. Runner IDs never cross
the command boundary. Cloud creation requires the immutable runtime, provider,
model, and one or more configured tags.

The adapter polls Center's event cursor endpoint from main and publishes
projected `ConversationEvent` values through the existing desktop event
publisher. Center persists a `user.prompt` event before dispatching a runner
prompt, and runner event metadata (`terminal`, `errorCode`, `error`) is retained
alongside the raw event. This lets the renderer rebuild turns after restart and
close a terminal assistant response without inventing a local cloud catalog.

Center HTTP responses with `202` or `204` are treated as empty successful
responses. Polling is best effort and resumes from the last persisted cursor;
transient failures do not reset the cursor or mark the conversation failed.

Cloud ACP permission requests are persisted as `permission.requested` events.
The event contains the runner-generated approval ID and the original ACP
request. The conversation owner resolves it through Center; Center sends a
`conversation.permission.resolve` command on the existing runner WebSocket.
Shared viewers can read the request but cannot resolve it. Pending approvals
survive a temporary runner or Center disconnect and are rebound on reconnect.

## Consequences

- The renderer uses one conversation client and one event reducer for local and
  cloud sessions.
- Cloud history is available even when the Electron local catalog has no record.
- Cloud rename/archive, viewer mutation, and HostTool resolution stay
  unsupported until their Center APIs exist; the adapter returns a typed
  `unsupportedCapability` error rather than silently mutating local state.
- The current poller is single-process and interval based. A future Center
  WebSocket/SSE subscription can replace it without changing the renderer port.

## Testing

Unit tests cover immutable selection, cloud routing, cursor deduplication,
terminal history projection, and unsupported operations. An E2E test connects
`TeaCenterCloudRunnerClient` to an HTTP Center fixture, starts a real
`TeaRunner` WebSocket client, executes a prompt, and verifies the projected
desktop events.

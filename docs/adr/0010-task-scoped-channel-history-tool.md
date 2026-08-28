# ADR 0010: Task-Scoped Channel History Tool

- Status: Superseded by ADR 0012
- Date: 2026-08-21
- Supersedes: ADR 0009's preload-context decision

## Context

ADR 0009 established that Channel Agent tasks reuse `ConversationRuntime`,
produce a human-reviewed `Draft`, and send only through `ChannelTransport`.
Its first implementation also made the Channel use case load a fixed window of
messages before starting the runtime.

That preload makes the host guess relevance. A selected `MessageRef` acts only
as the end of a recent-history page, so unrelated discussion can dominate the
Agent's answer. The Agent must instead evaluate the selected message first and
request additional evidence only when it is needed.

Tea Desktop currently runs Yunxin through a WebView transport while Tea,
Claude Code, and Codex execute behind the Rust `ConversationRuntime` boundary.
The solution therefore needs a provider-neutral tool contract and a temporary
bridge to a frontend executor without exposing Channel credentials or SDK DTOs.

## Decision

The initial task prompt contains the instruction and exactly one sanitized
anchor message. It does not contain an automatically selected history window.

Add one task-scoped, read-only model tool named `load_channel_messages`. It can
page before or after the anchor. Its scope fixes the Channel account, Channel
ref, and anchor outside model-visible arguments. A cursor is accepted only when
it is the anchor or a `MessageRef` previously returned by the same task scope.

Introduce a generic serializable host-tool boundary in `ConversationClient`
and `ConversationRuntime`: definitions, requests, results, and lifecycle errors.
A Tauri-owned broker correlates pending calls, enforces bounds and cancellation,
and delegates to a registered executor. While Channel facts live in the
WebView, `ConversationAgentTaskClient` executes the bounded query through
`ChannelTransport`. A future `TauriChannelTransport` moves the executor without
changing task, store, Draft, or component contracts.

Runtime adapters translate the same tool definition and result:

- Built-in Tea uses `tea-rs` `ToolSpec`/`ToolExecutor`. Missing task-scoped
  registration is implemented in `tea-rs`/`tea-coding` first.
- Claude Code uses a strict task-only MCP configuration with exactly the
  generated tool.
- Codex uses app-server `dynamicTools`, `item/tool/call`, and structured tool
  responses.

Runtimes advertise `hostTools` only after their structured call/result contract
is available. Channel task UI requires `prompt`, `events`, and `hostTools`.
Unsupported runtimes are unavailable; there is no fallback to bulk preload.

Draft approval remains the only Channel write path. The tool cannot send, edit,
delete, pin, react, mark read, or access another Channel.

## Bounds and security

- Initial anchor text: 4,000 characters.
- At most 6 calls, 10 messages per call, 40 unique refs, and 32,000 returned
  message characters per task.
- Tool arguments: 4 KiB/depth 4; result: 48 KiB/depth 6.
- At most one pending call per task and 32 globally; deadline 10 seconds.
- Results contain stable refs, sender display name, timestamp, direction, state,
  and bounded text. Revoked messages expose no original text.
- Credentials, provider extensions, attachments, receipts, SDK objects, raw
  cursors, and capability tokens never enter model input, events, or logs.
- Claude's loopback MCP endpoint uses a random port, task capability token, and
  `0600` temporary config, all destroyed with the task.

## Alternatives considered

Increasing or heuristically selecting the preload window was rejected because
the host still guesses relevance and spends context before Agent evaluation.

Parsing tool-like text in Pinia was rejected because it is not a structured
protocol and would duplicate runtime orchestration in a UI projection.

Adding Channel-specific branches to each store/component was rejected. Native
provider mapping belongs in runtime adapters below one host-tool contract.

## Failure and recovery

Tool scopes and pending calls close on task cancellation, terminal runtime
events, Channel disconnect, account switch, kicked-offline, application dispose,
or timeout. Late and duplicate results are ignored idempotently. A reconnect may
retry only while the same account and scope remain active.

Task tool scopes are process-local in this iteration. Application restart does
not resume a pending tool call. The task becomes a typed failed/cancelled state
and can be regenerated explicitly. Claude adapter startup removes stale
generated MCP config files left by an unclean prior exit.

## Migration

Extend `ChannelTransport` with provider-neutral before/after pagination and map
Yunxin `getMessageListEx`. Add the generic conversation tool boundary and each
runtime adapter. Then replace the fixed-window prompt with anchor-only input and
enable runtimes only when `hostTools` is declared.

## Rollback

Disable `hostTools` advertisement and hide affected runtimes from Channel task
creation. Preserve anchor selection, task projection, Draft review, and manual
send. Do not restore automatic bulk history preload.

## Consequences

Agent context becomes demand-driven and auditable. The runtime layer gains a
real cross-provider host-tool capability and lifecycle complexity, especially
for Claude's MCP bridge and current WebView execution. The same boundary also
allows future task-scoped read tools without exposing provider transports.

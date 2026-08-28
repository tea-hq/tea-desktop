# ADR 0028: Typed Electron Conversation Command Boundary

- Status: Accepted
- Date: 2026-08-29

## Context

The existing Electron conversation IPC called the legacy JSON service directly,
while the new runtime registry and SQLite catalog were initialized separately.
Moving only send, history, or collaboration commands to the new service would
create two writable conversation fact stores. Electron also drops custom Error
fields during ordinary rejected IPC invocation, so renderer callers could not
reliably receive stable `code` and `retryable` values.

ACP MCP attachments add another lifecycle constraint: a HostTool selection is
immutable for one Agent session. The old renderer flow configured HostTools
after conversation creation and before each turn, which cannot be represented
by an ACP session without silently replacing it.

## Decision

Electron main exposes conversation commands through one
`ConversationCommandService` port. The production composition selects
`RuntimeConversationCommandService` for the complete command surface; IPC
never splits commands between runtime and legacy implementations.

The runtime command adapter supplies the main-owned workspace id and projects
only renderer DTOs. Runtime bindings, artifact identity, protocol data, and
recovery markers do not cross preload. The new SQLite catalog owns Channel turn
contexts, sources, drafts, delivery attempts, conversation titles, archival,
and deletion. Drafts reference a real Channel turn context; deliveries bind one
draft version to one immutable Channel target and fixed-length idempotency key.

Commands cross `tea:command` in an explicit success/failure envelope. Main
normalizes failures to bounded `{ code, retryable, message? }` values and omits
unknown error messages. Preload unwraps the envelope while preserving the
existing typed client contract. Events use a compile-time payload map and the
preload allowlist; event payloads are cloned before publication.

HostTools are selected in `createConversation` and cannot be reconfigured by a
later renderer command. The renderer-side feature port may hold full
definitions for local execution, but preload IPC carries only exact
`{name, version}` references and rejects schema-bearing values. Electron main
resolves the canonical definitions before runtime configuration. Channel
collaboration subscribes to calls from that immutable scope. An explicit empty
selection remains distinct and creates no ACP MCP attachment.

## Failure And Recovery

- A malformed command envelope is rejected before service delegation.
- A malformed main result becomes a retryable `transportFailure` in preload.
- Unknown main failures become non-retryable `internal` without diagnostic text.
- Draft and delivery writes complete in SQLite before success is returned.
- A delivery may recover from `sending` or `failed`; a sent delivery cannot move
  back to a non-terminal state or change its sent message identity.
- Runtime deletion closes an active session before deleting catalog facts. A
  close failure preserves the durable record for later recovery.
- Renderer event listeners cannot throw into the authoritative runtime or
  catalog state machines.

## Migration And Rollback

Tea is pre-1.0. The unreleased SQLite schema version 1 is replaced directly to
add normalized draft and delivery tables; no compatibility reader or duplicate
JSON write is added. The atomic runtime cutover is complete. Existing legacy
conversation JSON is not imported, merged, or read as a compatibility fallback.

Rollback changes the production composition as one unit and preserves the typed
command envelope because it benefits every Electron command domain. It does not
split ownership or enable a hidden vendor-specific adapter.

## Consequences

- Task 11 switched one main composition binding without rewriting renderer
  feature contracts.
- ACP runtime registration is all-or-nothing after both pinned Agent artifacts
  verify; model/mode values remain limited to active-session advertisements.
- Existing unreleased Channel conversations created without immutable HostTools
  are not given a compatibility reconfiguration path.

## References

- `docs/adr/0024-authenticated-local-acp-mcp-attachment.md`
- `docs/adr/0027-disposable-acp-subjects-and-catalog-owned-channel-context.md`
- `electron/conversation/commandService.ts`
- `electron/ipc/conversationCommands.ts`
- `electron/ipc/commandResult.ts`
- `electron/ipc/events.ts`

# ADR-0002: Codex App-Server Runtime

- Status: Superseded by ADR 0022
- Date: 2026-08-20

## Context

Tea Desktop supports built-in Tea and external CLI agents through the shared
`ConversationRuntime` port. The original `ExternalCliRuntime` was named as a
generic adapter but parsed Claude Code output, which duplicated the dedicated
Claude adapter and produced two Claude Code choices in the UI.

Codex offers both one-shot `codex exec --json` output and a persistent
`codex app-server` JSON-RPC protocol. One-shot execution cannot faithfully own
the multi-turn thread lifecycle required by a desktop conversation.

## Decision

Remove the generic `ExternalCliRuntime`. Each external CLI gets a dedicated
adapter behind `ConversationRuntime`, with its vendor's structured protocol.
Claude Code retains its stream-json adapter. Codex uses one long-lived
app-server process and maps Desktop conversations to Codex threads and runs to
Codex turns.

The Codex adapter owns initialize/initialized negotiation, request correlation,
thread and turn identifiers, event projection, cancellation, process shutdown,
and bounded protocol diagnostics. It maps text, tool activity, terminal state,
and typed failures into the shared conversation events. It never parses
terminal-rendered text or constructs a shell command string.

Codex approval requests are translated into the shared typed approval contract.
Default and read-only modes use `approvalPolicy: on-request`; full-access mode
may bypass prompts only when explicitly selected by the user. The runtime keeps
the app-server request pending until Desktop returns one of the advertised
decisions. Approval state is projected beside its tool call rather than stored
as an independent transcript.

## Alternatives

- `codex exec --json` per message was rejected because it weakens multi-turn
  identity, cancellation, and lifecycle semantics.
- A generic CLI event parser was rejected because Claude and Codex do not share
  a protocol and such an adapter would hide vendor-specific state machines.
- Importing implementation code from another desktop product was rejected;
  only its validated app-server protocol approach is reused.

## Consequences

- This adapter established the required persistent-thread, approval,
  cancellation, and structured-event behavior for Codex.
- The current Electron registry does not expose this adapter or a built-in Tea
  runtime. It atomically exposes `external.claude` and `external.codex` through
  the generic ACP runtime after both official Agent artifacts verify.
- Codex App Server protocol handling now belongs to the pinned official
  `@agentclientprotocol/codex-acp` process rather than Tea main or the renderer.

This vendor-specific implementation remains historical evidence for the
required behavior. It is not a production fallback once the ACP runtime is
registered.

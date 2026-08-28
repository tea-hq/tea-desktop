# ADR 0024: Authenticated Local ACP MCP Attachment

- Status: Accepted
- Date: 2026-08-28

## Context

ACP `session/new`, `session/load`, and `session/resume` describe command-based
MCP servers. The ACP Agent launches that command and owns its stdin/stdout, so
the launched process cannot directly access Electron main's in-memory
`ConversationToolBroker`.

Tea must retain one broker owner for tool selection, bounds, frontend
notifications, Channel access, Plugin credential resolution, timeout,
cancellation, and shutdown. Moving these responsibilities into the MCP child
would create a second state machine and would require credentials or durable
conversation facts to cross into that process.

The attachment must work without a loopback HTTP service, shell interpolation,
credentials in ACP configuration, or a private tool-call envelope. It must be
bounded, versioned, deterministic, cross-platform, and usable by packaged
Electron builds without a system Node installation.

## Decision

Tea uses a transparent, authenticated local relay:

```text
ACP Agent MCP client
  <-> standard MCP over child stdin/stdout
  <-> Tea MCP relay process
  <-> authenticated local byte stream
  <-> official MCP StdioServerTransport in Electron main
  <-> ConversationToolBroker
```

Electron main creates one attachment per conversation MCP scope. It creates a
private temporary directory, a Unix domain socket on macOS/Linux or named pipe
on Windows, and a cryptographically random one-time capability. The capability
file contains only protocol version, endpoint, and capability, uses mode
`0600` inside a `0700` directory where the platform supports POSIX modes, and
is removed immediately after the relay reads it. The capability value never
enters ACP messages, command arguments, environment variables, logs, catalog
rows, snapshots, or renderer state. ACP receives only the absolute relay
entrypoint and capability-file path.

The relay sends one bounded V1 attachment preface, waits for a bounded
acknowledgement, and then becomes a blind duplex byte relay. Electron main
validates the preface with a timing-safe capability comparison, accepts one
authorized connection, and rejects excess attempts or bytes. After attachment,
Electron main connects the existing official MCP server through the official
MCP SDK `StdioServerTransport` over the authorized socket. All subsequent
messages are standard MCP; the attachment protocol carries no tool method,
arguments, result, credential, or conversation DTO.

The command is the absolute Electron executable with
`ELECTRON_RUN_AS_NODE=1`, and the relay is a separately built JavaScript
entrypoint packaged beside Electron main. It is launched with an argument
array, never a shell command. Attachment startup, handshake bytes, MCP message
bytes, connection attempts, and shutdown are bounded. Session failure, Agent
exit, relay exit, or app shutdown closes the MCP server, socket, listener,
pending broker calls, and private temporary directory exactly once. Ordinary
turn cancellation leaves the attachment alive because an ACP session can
accept later turns; changing HostTools instead requires a new session
lifecycle.

An explicit empty HostTool selection creates no listener, capability, relay
configuration, or MCP server. A configured scope is immutable for one ACP
session; changing it invalidates the scope and requires an explicit new
session lifecycle.

## Security Boundary

Tea treats the signed-in local OS account and explicitly launched ACP Agent as
the local process trust boundary. The capability and private filesystem modes
prevent other OS users and accidental local clients from attaching. They do
not claim to sandbox malicious code already running as the same OS user, which
can inspect that user's processes and files. Installing or selecting an Agent
therefore remains an execution trust decision.

The relay never prints endpoint, capability path, capability value, MCP
payloads, or stack traces. Its failure diagnostic is a fixed string. Main-side
errors expose stable categories without secret values.

## Alternatives Considered

### Execute HostTools in the relay

Rejected because it duplicates broker state and moves Channel state, Plugin
credential access, frontend notifications, and recovery behavior out of
Electron main.

### Loopback HTTP MCP server

Rejected because it adds a network listener and bearer-header lifecycle, and
contradicts the accepted command-based stdio requirement.

### Unauthenticated Unix socket or named pipe

Rejected because another local process could win the connection race and bind
itself to a conversation scope.

### Pass the capability in argv or environment

Rejected because process arguments and environment are observable and may be
captured by Agent diagnostics. Only the non-secret path to a one-time private
file is placed in ACP configuration.

### MCP over ACP

Deferred because ACP-carried MCP is still experimental and does not provide
the required stable V2-preferred/V1-compatible behavior. Tea does not add a
private ACP transport extension.

### Inherited file descriptor

Rejected because the ACP Agent, not Electron main, launches the command and ACP
stdio configuration has no portable inherited-descriptor contract.

## Consequences

### Positive

- Electron main remains the only HostTool and credential owner.
- Agent-facing traffic remains standard command-based MCP stdio.
- No HTTP bridge or private tool envelope is introduced.
- The capability is one-time, non-persistent, bounded, and absent from ACP.
- The relay is small, protocol-neutral, and independently testable.

### Negative

- Tea owns a small cross-platform local attachment protocol and cleanup logic.
- Packaging must include a second Electron-as-Node entrypoint.
- Same-user malicious processes are outside the isolation claim.
- A session cannot silently change its MCP tool selection.

## Failure, Recovery, And Rollback

- Invalid/missing capability files, malformed prefaces, excess attempts,
  timeout, relay exit, and MCP initialization failure close the attachment and
  fail session setup.
- Capability files and socket paths are never recovery data. Restore creates a
  fresh attachment from the persisted non-secret MCP selection before
  `session/load` or `session/resume`.
- Rollback supplies `mcpServers: []`, advertises no ACP HostTools, and leaves the
  legacy runtime path unchanged.

## References

- `docs/adr/0022-official-acp-electron-runtime.md`
- `docs/adr/0013-local-plugin-process-protocol.md`
- `docs/plans/2026-08-27-electron-acp-runtime-integration.md`
- `electron/conversation/toolBroker.ts`
- `electron/conversation/acp/mcpServer.ts`

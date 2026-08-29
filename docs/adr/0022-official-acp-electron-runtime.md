# ADR 0022: Official ACP With An Electron Host

- Status: Accepted
- Date: 2026-08-27

## Context

Tea Desktop needs one external-agent contract that preserves the current
conversation behavior: streaming output, tools, approvals, cancellation,
modes, models, MCP, channel history, Plugin actions, snapshots, subject
generation, multiple turns, and restart recovery.

The predecessor application was a Tauri 2 + Vue 3 implementation. Its
structured Claude stream and Codex App Server paths established the product
behavior that this Electron target must preserve. Those vendor-specific host
implementations have now been removed after the ACP compatibility gate; every
new agent uses the shared ACP process, projection, approval, and recovery
boundaries described below.

ACP is the public protocol designed for this boundary. It standardizes
initialization, capabilities, sessions, prompts, updates, permissions,
cancellation, modes, model/configuration discovery, and session loading. MCP
is the standard protocol for client-provided tools.

The official ACP implementations used by the selected agents are Node/TypeScript
programs:

- `@agentclientprotocol/claude-agent-acp` is the ACP adapter for the Claude
  Agent SDK.
- `@agentclientprotocol/codex-acp` is the ACP adapter that starts Codex App
  Server and maps its events to ACP.
- `@agentclientprotocol/sdk` is the official TypeScript ACP implementation
  and exposes typed Client and Agent APIs, NDJSON stdio streams, and an
  experimental V2 entry point.

The Rust ACP ecosystem does not provide equivalent, officially maintained
Claude and Codex adapters with the required feature and compatibility level.
Tea therefore adopts Electron as the desktop host for the ACP integration.
Electron's main process already provides the Node runtime required by the
official TypeScript ACP SDK and adapters. This is a host/runtime decision,
not a change to the wire protocol.

ACP V2 is still a draft in the evaluated TypeScript SDK. The stable package
entry point is ACP V1 and V2 is explicitly imported from
`@agentclientprotocol/sdk/experimental/v2`. V2 must remain the preferred
version for new connections, but the implementation must not pretend that a
draft API is stable or translate V1 messages into V2 messages.

## Decision

ACP is the only external agent-to-client wire protocol in Tea Desktop. The
Electron main process is the ACP Client and the official Claude/Codex
processes are ACP Agents.

```text
Vue renderer
  -> typed ConversationClient
  -> Electron preload IPC
  -> Electron main ConversationHost
  -> AcpConversationRuntime
       -> official @agentclientprotocol/sdk Client
       -> standard ACP NDJSON stream
       -> official ACP Agent process
            -> claude-agent-acp -> Claude Agent SDK
            -> codex-acp -> Codex App Server
       -> standard MCP HostTools server
```

The renderer never imports ACP types, launches processes, parses ACP messages,
or owns conversation orchestration. Electron main owns the runtime registry,
ACP connections, process records, typed client callbacks, HostTools, catalog
binding, and recovery. The product runtime adapter maps typed ACP facts into
the existing Tea conversation contract; it is not a second wire protocol.

ACP is used for external Agents only. This repository does not currently have
a built-in Tea Electron runtime, so the production registry exposes only the
Claude and Codex external runtimes. A future built-in runtime requires its own
product runtime owner and registry entry; it is not implemented as an ACP
compatibility branch.

### Official SDK And Adapter Ownership

| Concern                              | Owner                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| ACP V1/V2 schemas and typed dispatch | `@agentclientprotocol/sdk`                             |
| ACP Client callbacks                 | Electron main ACP Client                               |
| NDJSON ACP framing                   | official SDK `ndJsonStream`                            |
| Agent implementation                 | official Claude/Codex ACP adapter                      |
| Claude semantics                     | Claude Agent SDK inside the official Claude adapter    |
| Codex semantics                      | Codex App Server inside the official Codex adapter     |
| Desktop conversation identity        | Tea Electron main runtime                              |
| Tea event projection                 | `AcpEventProjector`                                    |
| HostTools                            | standard MCP server backed by `ConversationToolBroker` |
| Renderer IPC                         | typed Electron preload bridge                          |

Tea does not copy the official adapters into the product. Their behavior is
consumed through ACP, and their versions are pinned as managed agent
artifacts. The adapter source license and notices remain in the artifact
inventory.

### Agent Launch

Electron main constructs a typed `AcpAgentDefinition` containing exact package
identity, adapter entry point, argument vector, preferred wire versions, and
session configuration mappings. Before any ready runtime is published, the
artifact resolver verifies the pinned package name/version and a canonical
package-owned entry point. It starts that entry point with
`child_process.spawn`, uses Electron as Node through
`ELECTRON_RUN_AS_NODE=1`, and connects stdio to the official SDK stream. It
never invokes `npx`, a package manager, a shell, or `@latest` at runtime.

Electron Builder includes the production dependency closure and unpacks the
two ACP adapters, Claude Agent SDK packages, Codex launcher packages, and their
platform-specific optional packages. The child entry points and native
executables therefore resolve from `app.asar.unpacked` without system Node.
Packaging and target-specific process smoke tests remain explicit release
checks rather than default development validation.

### Registration Gate

`createAcpRuntimeRegistry` resolves every configured Agent artifact before it
constructs the registry. Registration is all-or-nothing: failure in either the
pinned Claude or Codex closure prevents both ready descriptors and fails host
startup. There is no partial registry, user-installed CLI fallback, or legacy
vendor runtime fallback.

The ACP SDK owns message schemas, JSON-RPC correlation, handlers, and stream
serialization. Electron owns ordinary host policy that is outside the ACP
wire protocol: selecting a known artifact, creating the child process,
constructing an explicit environment, applying workspace policy, bounding
transport input and diagnostics, and terminating the process on connection
close. These policies are implemented once in the Electron ACP host and are
not exposed as a private agent protocol.

### ACP Version Rule

Every new connection attempts the highest mutually compatible official version
with V2 preferred. The TypeScript SDK's V2 API is imported explicitly from
`@agentclientprotocol/sdk/experimental/v2`; V1 uses the stable package entry
point.

The Electron connection factory may probe V2 and create a fresh V1 connection
when the Agent only accepts V1. It does not transform messages between
versions. Once initialized, a connection uses exactly one wire version. The
selected version is recorded in the runtime binding and restore requires that
same version; existing sessions are never silently upgraded or downgraded.

The pinned Claude `0.70.0` and Codex `1.7.0` adapters currently answer the V2
probe with a valid V1 initialization shape. The official V2 decoder rejects
that shape before exposing its protocol version, so the factory recognizes
only that decoder issue as the V1 compatibility signal and retries on a fresh
V1 connection. Other decode, transport, or process failures remain explicit
connection failures.

If the official TypeScript SDK later exposes a general client-side protocol
connector, Tea adopts it. Until then, the Electron factory is limited to
starting an official V2 or V1 Client on a fresh connection and selecting the
initialization result. It does not become a general ACP router or schema
translation layer.

### Connection And Session Model

One ACP process generation has one connection. A connection may own multiple
ACP sessions only when the Agent advertises and passes the required
multi-session behavior. Each Desktop conversation maps to one opaque ACP
session id.

The runtime creates a session with `session/new`, sends turns with
`session/prompt`, consumes `session/update`, cancels with `session/cancel`, and
restores the exact session with `session/load` or `session/resume`. The update
callback is registered before either request so replay or unexpected updates
cannot be lost.

`session/load` and `session/resume` are both valid exact-session recovery
operations. When V1 load is advertised, Tea installs a bounded replay collector
before the request and releases Snapshot/History only after complete replay.
Otherwise, supported V1 or V2 resume restores the same Agent-owned session and
may continue future turns without returning prior messages. That actor rejects
Snapshot/History until a complete projection exists; it is never forced through
load and never exposes an empty or suffix-only projection as complete history.
A new session or local transcript fallback cannot conceal an unavailable
recorded session.

### Product Projection

`AcpEventProjector` is the only module that understands ACP session update
variants. It validates session ownership, turn identity, tool identity,
permission identity, terminal transitions, and event ordering before emitting
Tea events.

It maps:

- assistant content to message deltas;
- tool calls and progress to tool events;
- permission requests to approval events;
- terminal output and filesystem operations to their existing projections;
- prompt stop reasons and transport failures to typed terminal failures;
- complete `session/load` replay to the Tea snapshot and history projection.

ACP is authoritative for agent prompts, assistant content, tool facts, and
session persistence. Tea's snapshot and history are read projections, not a
second transcript authority.

### Permissions, Modes, And Models

Electron main advertises only filesystem and terminal callbacks that it can
enforce under Tea's workspace and permission policy. It validates paths,
output sizes, terminal ownership, cancellation, and cleanup before executing
a callback.

ACP permission options are preserved by wire option id. Tea maps them to the
existing approval surface and accepts only an option offered by the current
request. It does not claim that `AllowSession` was applied when the Agent did
not offer a session-level option.

Agent modes and models are selected only from the active ACP session's
advertised configuration. Tea applies required changes before
`session/prompt`, tracks configuration update notifications, and rejects
unadvertised ids before creating a turn.

The pinned mappings are:

| Runtime          | `readOnly`  | `default` | `fullAccess`        | Default model |
| ---------------- | ----------- | --------- | ------------------- | ------------- |
| Claude ACP Agent | `plan`      | `default` | `bypassPermissions` | `default`     |
| Codex ACP Agent  | `read-only` | `agent`   | `agent-full-access` | unchanged     |

V1 mode changes use `session/set_mode` when the Agent advertises V1 modes;
V1/V2 config options use `session/set_config_option`. Runtime descriptors do
not guess static Claude or Codex model ids because model availability is
session/account-specific. Until a protocol-neutral post-create configuration
contract exists, the renderer exposes only its configured-default choice.

### HostTools Through Standard MCP

Tea HostTools are exposed through standard MCP. Electron main starts or owns a
standard MCP server for the selected conversation scope and supplies its
command-based stdio configuration in ACP `session/new`, `session/load`, and
`session/resume`.

```text
ACP session/new, session/load, or session/resume
  -> standard MCP server definition
  -> Agent connects to MCP server
  -> MCP tools/call
  -> ConversationToolBroker
  -> channel history or Plugin action executor
```

`ConversationToolBroker` remains the owner of scope, argument/result bounds,
timeouts, cancellation, frontend notifications, plugin credential
resolution, and channel history access. Credentials never enter ACP session
configuration, MCP arguments, transcripts, or renderer state. An explicit
empty MCP selection attaches no server.

Tea does not add a private ACP method, HTTP bridge, or JSON-RPC tool envelope.

The command-based MCP server runs in a process started by the ACP Agent and
therefore cannot directly call Electron main's in-memory broker. ADR 0024
defines the accepted local attachment: Electron main owns the MCP server and a
one-session authenticated socket, while an Electron-as-Node child performs a
transparent byte relay between Agent-owned stdio and that socket. The private
attachment handshake is bounded and carries no MCP methods or product DTOs;
all traffic after authentication is standard MCP handled by the official SDK.

The attachment is supplied only for a non-empty immutable HostTool scope. It
is created before `session/new`, must become ready before session creation
completes, and closes with session failure, Agent exit, or runtime shutdown.
Ordinary turn cancellation leaves the multi-turn session attachment alive.
Renderer creation requests carry only HostTool `{name, version}` references.
Electron main rejects schema-bearing IPC values, resolves canonical definitions
from its own catalog, and persists only the immutable references. Ready ACP
runtimes advertise HostTools after the atomic registration gate succeeds.

### Persistence And Recovery

The conversation catalog stores Desktop identity separately from agent-owned
session content. A non-secret runtime binding contains:

```text
agent definition id and revision
ACP wire version
official adapter package identity, version, and integrity
opaque ACP session id
workspace/cwd binding
selected MCP server/tool ids
```

It never stores credentials, environment values, protocol transcripts, or
unbounded diagnostics.

On restore, Electron resolves the exact Agent definition and artifact, starts
the recorded ACP version, attaches the recorded MCP selection, registers the
update handler, and calls supported `session/load` or `session/resume`.
Binding mismatch, missing artifact, unavailable session, incomplete requested
replay, invalid update, or unsupported configuration is an explicit restore
failure. Tea never silently starts a new session or switches Agent
implementation for the same Desktop conversation.

### Capability Matrix

The generic ACP runtime may replace the current external runtimes only after
the selected official adapters satisfy all applicable rows:

| Existing behavior       | ACP implementation                        |
| ----------------------- | ----------------------------------------- |
| Prompt and streaming    | `session/prompt` and `session/update`     |
| Tool calls and progress | ACP session update content                |
| Approval                | `session/request_permission`              |
| Cancellation            | `session/cancel` and terminal observation |
| Modes and models        | advertised ACP session configuration      |
| Channel history         | standard MCP `tools/call`                 |
| Plugin actions          | standard MCP `tools/call`                 |
| Snapshot and history    | complete `session/load` replay            |
| Subject generation      | disposable ACP session                    |
| Multiple turns          | one ACP session per conversation          |
| Restart recovery        | exact binding plus load or resume         |
| Terminal/filesystem     | official ACP client callbacks             |

An unsupported row is an unsupported Agent capability. Tea does not add a
vendor-specific replacement protocol or a hidden fallback runtime.

## Alternatives Considered

### Rust ACP Client And Rust Vendor Adapters

Rejected as the final host path. The generic Rust ACP SDK is useful, but the
Rust ecosystem does not provide equivalent official Claude and Codex adapters.
Maintaining Rust ports would create vendor SDK parity and upstream adapter
fork debt without improving the ACP contract.

### Keep The Predecessor Tauri Host For ACP

Rejected for the ACP integration because it requires the product to bridge
from the Tauri/Rust host into Node-based official adapters and maintain a
second language boundary for the ACP Client. Electron main can use the
official TypeScript Client directly.

### Copy Official Node Adapters Into Rust

Rejected. The protocol wrapper is only part of each adapter. Claude depends on
Claude Agent SDK semantics; Codex depends on Codex App Server semantics. A
ported fork would have to track permissions, history, MCP, model/mode,
terminal, subagent, and failure behavior as upstream changes.

### Hand-Written Vendor Protocols In Tea

Rejected. ACP remains the only external wire protocol. Vendor-specific logic
belongs inside the official Agent adapter and is not duplicated in Tea.

### Runtime `npx` Resolution

Rejected. Runtime package installation and `@latest` resolution make the
Agent identity non-reproducible and require network/package-manager behavior
inside the application.

## Consequences

### Positive

- Electron main and the renderer use one official TypeScript ACP Client.
- Claude and Codex use maintained official ACP adapters.
- Tea does not own Claude SDK or Codex App Server event parsers.
- ACP V2 can be adopted without a V1/V2 translation layer.
- Standard MCP preserves channel history and Plugin actions.
- The renderer and product runtime remain vendor-neutral.
- Native ACP Agents can still be registered without Node-specific code.

### Negative

- The official adapters and ACP V2 SDK are JavaScript/TypeScript artifacts
  that require pinned package closure and release testing.
- Electron main still owns ordinary process, environment, transport bounds,
  and recovery policy.
- ACP capabilities do not guarantee semantic parity; the complete matrix is
  a release gate.
- ACP V2 and some MCP/extension surfaces may change while upstream marks them
  experimental.

## Recovery And Rollback

- A connection failure completes every affected operation with one typed
  transport failure and closes pending approvals.
- Restore uses the recorded artifact and wire version and fails explicitly on
  mismatch or incomplete replay.
- A failed artifact verification prevents launch before ACP initialization.
- Application shutdown closes MCP servers, ACP connections, and child Agents
  in dependency order and waits for bounded termination.
- The production composition uses only the ACP registry for external Agents.
  Rollback replaces that composition as one unit; it does not enable a hidden
  vendor parser or a per-runtime fallback.

## References

- Official TypeScript ACP SDK: `@agentclientprotocol/sdk`
- Official Claude ACP adapter: `@agentclientprotocol/claude-agent-acp`
- Official Codex ACP adapter: `@agentclientprotocol/codex-acp`
- Electron main-process IPC and child-process APIs
- `docs/adr/0024-authenticated-local-acp-mcp-attachment.md`

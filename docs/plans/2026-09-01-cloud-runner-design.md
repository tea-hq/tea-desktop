# Cloud Runner Design

> Status: WIP vertical slice
> Date: 2026-09-01
> Scope: tea-desktop, tea-center, and `@tea/runner`

## Goal

Reuse Tea Desktop's ACP runtime in a long-lived executable that can run on a
container or an enterprise server. The executable is always a cloud Runner
from the product's point of view. It connects to Tea Center over one
multiplexed WebSocket, while one local TOML file may contain several logical
Runner registrations.

Desktop and future mobile clients select a tag, runtime, provider, and model.
Center selects a concrete Runner internally, owns cloud conversation history,
and forwards structured ACP events through a durable event boundary.

## Ownership

- `@tea/runner` owns Runner process lifecycle, ACP execution, local
  workspaces, reconnect state, ordered event spooling, and TOML persistence.
- Tea Center owns token scope, Runner visibility, tag routing, assignments,
  conversation state, raw events, plugin references, and access control.
- Desktop owns UI projections and sends typed commands through the Electron
  main/preload boundary. It never receives or sends a Runner ID.

## Runner Process and Configuration

There is one executable, one service process, and one Center WebSocket per
configuration file. A TOML file can contain multiple logical Runner entries:

```toml
center_url = "https://center.example.com"
workspace_root = "/tmp/tea-runner"
state_dir = "/var/lib/tea-runner"

[[runners]]
local_key = "host-linux"
name = "build-host"
scope = "tenant"
token = "<registration-token>"
tags = ["linux", "acp"]
limit = 5

[[runners]]
local_key = "host-gpu"
name = "build-host"
scope = "tenant"
token = "<registration-token>"
tags = ["gpu", "acp"]
limit = 5
```

`local_key` is stable local identity. Center-created Runner IDs,
`instanceId`, and assignment epochs are internal facts and are not rendered to
users. Names may repeat because separate entries can be associated with
different tokens or tags. Tags are required, unique within an entry, and are
configured by the Runner owner. Center uses tags for filtering only; it does
not synchronize or validate runtime/provider/model capability lists.

The default workspace root is a fixed temporary directory. Each conversation
gets an isolated child directory below that root. Center stores only an opaque
`workspaceRef`; the machine path never crosses the user-facing API.

`concurrent` defaults to the number of logical Runner entries. Each entry's
`limit` defaults to 5. Center may change `concurrent`, `limit`, or `tags` over
the existing WebSocket; the Runner writes the update to the TOML file and
reloads it immediately. The configuration file remains the sole durable
source; the last accepted writer wins.

## Registration Tokens

Tokens are long-lived bearer credentials with a scope of `tenant`, `group`, or
`user`. Tenant tokens are visible to every tenant member, personal tokens only
to their owner, and group tokens are reserved for the future organization
directory. Center creates the tenant and personal token when an authenticated
endpoint or browser session is issued, before the credential is returned. The
token list endpoint is read-only and returns those already-provisioned active
tokens through the authenticated cloud client. There is no required
administrator issue step for normal use.

Tenant or platform administrators can reset the tenant token. A user can reset
their personal token. Reset revokes the previous token immediately and returns
the replacement. Revoked tokens are rejected on the next connection and active
connections using them are closed. Center never logs token secrets; Desktop
keeps them only in in-memory UI state.

Desktop can generate a directly executable registration command for a selected
visible token. The token's scope is authoritative in Center and is not a CLI
option. The command intentionally omits name and tag: the Runner prompts on
the target machine, where it can obtain that machine's hostname and generate a
machine-derived default tag. The registration command only writes the
configuration and starts the background Runner with `--install-service`:

```sh
npx --yes @tea/runner register --center-url 'https://center.example.com' --token '<registration-token>' --install-service
```

The interactive CLI prompts for name and tag through the target machine's
controlling terminal, accepting the target machine's defaults on an empty line.
`install-service` remains available as a separate command for an already-written
configuration.

## Conversation Routing

Creation sends the following immutable selection to Center:

```json
{
  "executionTarget": "cloud",
  "tags": ["gpu"],
  "runtimeId": "acp.codex",
  "providerId": "openai",
  "modelId": "gpt-5.6-sol",
  "permissionMode": "default"
}
```

Center selects an available logical Runner matching the tag. The concrete
Runner ID is never sent to Desktop. Provider/model capability synchronization
is intentionally not required in this WIP; if the selected Runner cannot run
the requested combination, the command fails with a structured error.

Only one turn may be active per conversation. New prompts are accepted while
the Runner is online. If it is offline, Center returns `RUNNER_OFFLINE` and
does not queue a new prompt. A scheduled-task API may later select a tag with
multiple matching Runners; this release only exposes tag availability and
selection.

Center automatically attaches enabled tenant plugin references, including the
built-in Overmind plugin. Credentials stay in Center and are never written to
Runner configuration or ACP payloads.

## Connection and Recovery

The WebSocket starts with `host.hello`, followed by one `runner.attach` frame
per logical entry. Heartbeats, commands, events, acknowledgements, config
updates, and resume data share this connection.

Disconnecting a Runner does not terminate an active ACP task. Center marks it
`running_offline`; the Runner continues locally and appends raw events to its
durable spool. Spool writes retry indefinitely on `ENOSPC` or `EDQUOT`, so an
event is never dropped or converted into a false failure. After reconnect, the
Runner resumes its entries and replays the spool in sequence order. Offline
cancel requests are remembered by Center and sent after reattachment.

`stop()` drains command chains and active ACP tasks indefinitely. Only an
explicit force shutdown clears active work. No automatic failover or ACP
replacement is performed.

## Durable History and Sharing

Center persists every raw structured ACP event, sequence, assignment, and
conversation projection before notifying clients. Desktop reads the event
cursor and reconstructs the existing conversation timeline.

Conversations are private to their creator until explicitly shared. A share
grant supports tenant, user, group, and IM-group audiences; membership is
resolved dynamically. Viewers can read history but cannot modify, delete,
approve, or reshare. The share model leaves an audience hook for future IM
group or individual access changes.

## Stable Failure Semantics

The protocol is versioned and uses message/correlation IDs, assignment epochs,
and per-conversation event sequences. Center persists an event before sending
the acknowledgement. Runners deduplicate command IDs and replay unacknowledged
events after reconnect.

Important errors include invalid input, revoked token, unavailable tag,
offline Runner, stale assignment, busy conversation, unsupported runtime, and
ACP execution failure. A Runner failure is returned to the initiating client;
Center does not silently switch to another Runner.

## Implemented Surface

- Shared ACP runtime and `tea-runner` CLI with TOML, multiple logical entries,
  one WebSocket, isolated temporary workspaces, spool replay, reconnect, and
  graceful drain.
- Center token visibility/reset, multiplex registration, tag routing, config
  updates, cloud conversation/event APIs, plugin refs, sharing, and durable
  runner state.
- Desktop cloud conversation adapter, tag selector, token panel, personal
  reset, one-command registration generation, event polling, and history
  projection.
- Center administration page for Runner status and scoped token reset.

Capability synchronization, group-directory authorization, scheduled-task
execution, model gateway credential leasing, and multi-replica WebSocket
routing remain future work.

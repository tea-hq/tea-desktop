# ADR 0025: Exact ACP Session Recovery

- Status: Accepted
- Date: 2026-08-28

## Context

Tea must recover an external Agent conversation without creating a replacement
session, changing Agent implementation or protocol version, or treating a
renderer/local transcript as the Agent's canonical history. The durable
catalog therefore needs enough non-secret identity to recreate the exact ACP
boundary. Continuing the Agent-owned session and rebuilding a complete Tea
history projection are related but distinct capabilities.

The pinned official `@agentclientprotocol/sdk@1.4.0` has an important version
difference. Stable ACP V1 exposes `session/load`, guarded by the Agent's
`loadSession` capability, and requires the Agent to replay history through
`session/update` before returning. V1 can also advertise `session/resume`.
Experimental V2 uses `session/resume` for an existing session. Resume restores
the Agent-owned context and may continue future turns without returning prior
messages, so a successful resume is valid session recovery but is not by
itself proof of a complete Tea Snapshot or History projection.

## Decision

Tea introduces a versioned, renderer-invisible runtime binding containing:

- runtime id and opaque native session id;
- Agent definition id and revision;
- selected ACP wire version;
- exact package name, version, and integrity identity;
- absolute workspace binding;
- immutable HostTool name/version references.

The binding contains no credentials, executable paths, environment values,
attachment endpoints, capabilities, transcripts, or diagnostics. The active
Agent definition and HostTool configuration must exactly match the binding
before a child process is started.

Recovery uses the binding's exact wire version. A V1 binding starts a fresh V1
connection and prefers `session/load` when initialization advertises
`loadSession`. It creates the recorded MCP attachment, installs a bounded
replay collector, and calls `session/load`. Replay notifications are validated
for wire version and session ownership and projected through the shared Tea
timeline reducer. The snapshot is released only after the typed load response
and replay completion.

When V1 lacks load but advertises resume, Tea calls V1 `session/resume`. A V2
binding calls official V2 `session/resume`. Both paths use the exact recorded
session id, wire version, workspace, and MCP selection. Tea does not downgrade,
start a new session, or change Agent implementation. A resume without complete
replay activates the session for future prompts but leaves Snapshot and History
unsupported for that actor. It never publishes an empty or post-resume-only
projection as complete history.

Replay is bounded by update count, turn count, and text bytes. Unsupported
visible content, output before a user message, wrong-session updates,
incomplete tool lifecycles, empty/future-only replay, connection failure, and
attachment failure all fail recovery and close the connection and attachment.
No partial snapshot becomes observable.

After creation or successful load, the session actor maintains an ephemeral
replayable Tea projection for Snapshot and History reads. A resumed actor also
projects new events for state-machine correctness but does not expose that
suffix as complete history. ACP remains authoritative; this projection is not
persisted as an alternate transcript.

## Consequences

### Positive

- Restore cannot silently change Agent, artifact, workspace, wire version, or
  HostTool selection.
- Recovery uses official typed load or resume requests on the recorded wire.
- Partial or malformed replay never becomes a successful snapshot.
- Snapshot/history projection stays in the runtime owner, not the renderer.

### Negative

- Resume-only recovery cannot expose historical Snapshot or History until Tea
  has a complete durable projection or validated protocol replay.
- V1 replay does not carry every historical terminal reason, so activation
  still requires compatibility testing against the selected official Agents.
- Catalog persistence and atomic create/restore binding writes remain a
  separate slice.

## Alternatives Considered

### Require `session/load` For Every Restore

Rejected because it conflates continuation of the exact Agent-owned session
with complete history replay. Official `session/resume` is sufficient for the
former; Snapshot and History remain explicitly unavailable when replay is not
complete.

### Treat Resume As Complete History

Rejected because resume may return no previous messages. Tea must not publish
an empty or suffix-only projection as the whole conversation.

### Retry A V2 Binding As V1

Rejected because it silently changes the recorded protocol and may target a
different Agent session namespace or behavior.

### Rebuild From Tea's Persisted Turns

Rejected because it creates a second transcript authority and can conceal an
unavailable or incompatible Agent-owned session.

## Failure, Recovery, And Rollback

All validation failures are typed and occur before launch where possible.
Load, resume, replay, MCP, or transport failure closes every newly created
resource and leaves the binding unchanged for diagnosis/retry. The production
registry now advertises the generic ACP runtime after the atomic artifact gate;
a resume-only actor still rejects Snapshot and History until it has a complete
projection.

## References

- `docs/adr/0022-official-acp-electron-runtime.md`
- `docs/adr/0024-authenticated-local-acp-mcp-attachment.md`
- `docs/plans/2026-08-27-electron-acp-runtime-integration.md`
- `electron/conversation/acp/session.ts`
- `electron/conversation/runtime.ts`

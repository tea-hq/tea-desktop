# ADR-0005: Conversation Catalog and Runtime-Owned Recovery

- Status: Accepted; Electron implementation refined by ADR 0022, 0025, and 0026
- Date: 2026-08-21
- Updated: 2026-08-29

## Context

Tea Desktop needs a durable sidebar identity across application restarts while
external Agents retain authority over their own sessions and transcripts. The
renderer cannot become a second transcript store or infer recovery from
terminal text. Recovery must also preserve the exact runtime, Agent artifact,
ACP wire version, workspace, native session, and HostTool selection.

The original decision described Tauri/Rust and vendor-specific Claude/Codex
recovery. Those host details are historical. ADR 0022 supersedes them with one
Electron main-process ACP boundary.

## Decision

Electron main owns `$APP_DATA/conversation-catalog.sqlite3`. The catalog is the
source of truth for Desktop conversation identity, runtime and workspace ids,
opaque native session id, strict runtime binding, bounded sidebar metadata,
optional Channel binding, archive state, and bounded restore-failure facts.
Agent-owned conversation content remains outside the catalog.

The runtime binding records only non-secret recovery identity:

- runtime id and opaque ACP session id;
- ACP Agent definition id and revision;
- exact adapter package name, version, and integrity;
- selected ACP wire version and absolute workspace path;
- immutable HostTool `{name, version}` references.

It never stores HostTool schemas, credentials, environment values, executable
paths, MCP attachment endpoints, ACP messages, transcripts, or unbounded
diagnostics.

`RuntimeConversationService` owns catalog/runtime coordination. Creation first
validates the product request and resolves HostTool references through the
Electron main catalog. It configures the runtime, creates the ACP session, and
then commits the catalog row. A catalog failure closes only that newly created
runtime conversation. Success is not reported before the local write commits.

Idempotency is catalog-owned. A repeated key must have the same runtime,
workspace, Channel binding, and HostTool references. An inactive matching
record is restored through the main-owned HostTool catalog again; renderer
schemas are never reused. A changed request fails without creating a session.

Restore validates the stored binding against the active Agent definition,
artifact, wire version, workspace, and canonical HostTool definitions before
starting the recorded session. ACP `session/load` and `session/resume` are both
valid exact-session recovery operations:

- V1 `session/load` installs a bounded replay collector before the request and
  exposes Snapshot/History only after complete replay succeeds.
- V1 or V2 `session/resume` may continue the exact Agent-owned session without
  replay. It is not forced through load and does not claim that a missing
  historical projection is complete.

The renderer subscribes before requesting history and treats its state as a
projection. The active runtime map is only a live-handle cache. Catalog lookup
plus exact runtime recovery is sufficient after process restart.

Catalog pages use opaque versioned keyset cursors ordered by
`updated_at DESC, conversation_id DESC`, with bounded limits. SQLite
initialization or schema failure prevents host startup; there is no in-memory
or legacy JSON fallback.

## Alternatives

- Persisting Pinia turns was rejected because it creates a second transcript
  authority and duplicates runtime recovery state.
- Parsing vendor files or terminal output was rejected because it bypasses ACP
  ownership and creates vendor-specific state machines in Tea.
- Requiring `session/load` for every restore was rejected because ACP
  `session/resume` is a valid continuation operation even without replay.
- Accepting renderer-provided HostTool schemas was rejected because Electron
  main owns executable tool definitions and validation.
- Offset pagination was rejected because insertions can duplicate or skip rows.

## Consequences

- Electron main exposes `external.claude` and `external.codex` through one
  generic ACP runtime only after both pinned Agent artifacts verify.
- Sidebar identity survives restart without making SQLite or Vue a transcript
  owner.
- Restore never silently creates a replacement session, changes wire version,
  switches Agent implementation, or falls back to the removed vendor path.
- A resume-only actor can accept later prompts but complete historical
  Snapshot/History remains unsupported until a validated replay exists.
- No built-in Tea Electron runtime is invented by this decision; adding one
  requires its own runtime owner and registry entry.

## Migration, Rollback, and Recovery

This is the first unreleased catalog schema. Under the pre-1.0 compatibility
policy, incorrect experimental formats are replaced directly; no Tauri JSON
import, dual reader, or compatibility state machine is retained. Before the
first public compatibility boundary, schema migrations, backup, rollback, and
corruption recovery must be specified.

Restore failure leaves the binding unchanged and records only a stable code and
timestamp. A later successful restore clears the marker. A corrupt or
unsupported database is preserved for diagnosis and is never auto-deleted.

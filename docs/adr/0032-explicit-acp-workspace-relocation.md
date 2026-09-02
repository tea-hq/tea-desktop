# ADR 0032: Explicit ACP Workspace Relocation

- Status: Accepted
- Date: 2026-09-02

## Context

An ACP conversation binding records the absolute workspace used to launch the
Agent and to load or resume its native session. A historical workspace can be
deleted or moved. Starting the Agent with that path then fails at process
startup, which previously surfaced as the generic retryable
`connectionFailed`. Repeating the same restore cannot repair a path that no
longer exists, while silently falling back to the desktop process directory
would change the recorded session context without user consent.

The user still needs a way to recover an otherwise valid Agent-owned session
after moving its project. This changes the binding lifecycle established by ADR
0025: most binding fields remain immutable, but a workspace may be replaced by
an explicit recovery command with transactional catalog semantics.

## Decision

Electron main validates every effective ACP workspace before process startup.
The path must be absolute, canonicalizable, accessible, and a directory. A
failure is reported as `workspaceUnavailable` with `retryable: false`; no child
process or ACP connection is started and no fallback directory is selected.

Ordinary retry means retrying the unchanged binding. It remains available only
for retryable failures and must perform a real reload even when the conversation
is already selected.

Workspace relocation is a separate typed command that receives a conversation
id and a user-selected absolute directory. Main serializes relocation with
ordinary restore for that conversation and performs these steps:

1. Validate and canonicalize the candidate directory.
2. Build a candidate binding by changing only `workspacePath`.
3. Restore the exact recorded native ACP session using the candidate binding.
4. Atomically replace the durable binding and matching summary working
   directory, clearing any restore failure.

The durable catalog remains unchanged until step 3 succeeds. If ACP rejects the
candidate, main closes candidate runtime resources and retains the original
row. If the catalog write in step 4 fails, main closes the restored candidate
runtime and retains the original durable row. The user may then choose another
directory or retry later.

Local conversation `summary.workingDirectory` is the UI projection of the
effective binding workspace and must equal `binding.workspacePath`. New local
conversations persist the workspace returned in the runtime handle. Schema
version 3 backfills older rows whose summary directory is null from a valid
binding workspace.

ACP V1 `session/load`, V1 `session/resume`, and V2 `session/resume` all receive
the candidate cwd during relocation. Runtime, Agent implementation, artifact,
wire version, native session id, model selection, and HostTool references remain
unchanged.

## Consequences

- A permanently missing directory has a precise, actionable error instead of a
  misleading generic retry.
- Project relocation is always initiated by the user and cannot silently alter
  Agent execution context.
- ACP recovery validates the replacement before durable identity changes.
- Catalog/runtime compensation is required because ACP restore and SQLite
  persistence cannot share one transaction.
- Summary and binding workspace facts no longer diverge for local
  conversations.

## Alternatives Considered

### Fall Back To The Desktop Working Directory

Rejected because it silently changes filesystem scope and can resume an Agent
in an unrelated repository.

### Update The Catalog Before ACP Recovery

Rejected because a rejected or incompatible replacement would destroy the last
known durable binding.

### Treat Relocation As An Ordinary Retry

Rejected because retry has no new directory input and should preserve the
recorded recovery identity.

### Copy Or Restore The Missing Directory

Rejected because Tea should not synthesize or recover user filesystem content.
The user explicitly requested code-level recovery only.

## Migration, Rollback, And Recovery

Schema version 3 backfills a null `working_directory` from the validated binding
JSON during migration. Invalid catalog data fails initialization rather than
being guessed or rewritten. Rolling back this feature requires rolling back the
schema and command surface together; it must not introduce a dual reader or a
fallback state machine.

Failed relocation preserves the original binding and stable restore failure.
Successful relocation replaces both workspace facts atomically and clears that
failure. No credentials, diagnostics, or filesystem contents are persisted.

## References

- `docs/adr/0025-exact-acp-session-recovery.md`
- `docs/adr/0026-main-owned-runtime-conversation-catalog.md`
- `docs/plans/2026-08-31-agent-working-directory.md`
- `electron/conversation/service.ts`
- `electron/conversation/acp/runtime.ts`
- `electron/conversation/catalog.ts`

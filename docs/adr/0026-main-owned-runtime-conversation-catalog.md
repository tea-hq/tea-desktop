# ADR 0026: Main-Owned Runtime Conversation Catalog

- Status: Accepted
- Date: 2026-08-28

## Context

ADR 0025 defines the exact, renderer-invisible binding needed to recover an
ACP session. That binding is currently returned only from the live runtime, so
an application restart loses the Desktop conversation identity required to
find it again. The existing `conversation-state.json` belongs to the legacy
vendor-specific conversation service and also contains transcripts, HostTool
schemas, collaboration state, and process-specific fields. Extending that file
would mix the new runtime boundary with state that ACP must not treat as
canonical.

Creating an ACP session and recording it cannot be one SQLite transaction. A
failed catalog write must therefore close exactly the newly created runtime
conversation without shutting down other sessions.

## Decision

Electron main owns `$APP_DATA/conversation-catalog.sqlite3`. A dedicated
versioned SQLite catalog stores:

- stable Desktop conversation, runtime, workspace, native session, and
  idempotency identities;
- the strict versioned runtime binding from ADR 0025;
- bounded sidebar metadata and optional Channel binding;
- bounded last-restore failure code and timestamp.

The catalog does not store credentials, environment values, executable paths,
HostTool schemas, ACP transcripts, attachment endpoints, capabilities, or
unbounded diagnostics. `PRAGMA user_version` is the schema authority. An
unsupported version fails initialization without rewriting or deleting the
database.

A main-process runtime application service owns catalog/runtime coordination.
Creation validates the request, resolves and configures HostTools, creates the
runtime session, then commits the catalog row. Success is returned only after
the local write completes. If that write fails, the service calls the runtime's
per-conversation close operation and reports the storage failure. Cleanup
failure is attached as bounded diagnostic context but does not replace the
storage failure.

Idempotency is catalog-owned. Reusing a key with the same runtime, workspace,
Channel binding, and HostTool references returns the recorded conversation and
restores it lazily when needed. Reusing it with different creation identity is
an invalid request.

Restore reads and validates the stored binding, resolves full HostTool
definitions from its immutable name/version references, configures the runtime,
and delegates exact recovery to that runtime. A restore failure leaves the
binding intact and records only a stable bounded error code and timestamp. A
later successful restore clears that marker.

The production Electron composition now routes the complete conversation
command surface through this service and catalog. The legacy JSON service is
not a production fallback and is not merged or dual-written.

## Consequences

- Desktop-to-runtime identity survives process restart without introducing a
  second transcript owner.
- Runtime creation has an explicit compensation path when durable recording
  fails.
- HostTool recovery depends on a main-owned resolver and cannot reconstruct
  schemas from history or binding JSON.
- Creation IPC carries only HostTool name/version references. New creation,
  idempotent activation, and cold restore all re-resolve canonical definitions
  before runtime configuration.
- SQLite work is synchronous inside Electron main; operations are deliberately
  small and bounded. Larger or cross-process workloads require a later
  ownership decision rather than silently moving database access to renderer.

## Migration, Rollback, And Recovery

This is an unreleased version-1 schema. Under the pre-1.0 compatibility policy,
an incorrect initial schema may be replaced directly before activation; no
legacy JSON import or dual reader is added. After the first public contract,
schema changes require forward migrations, backup, rollback, and corruption
recovery policy.

Rollback replaces the runtime catalog composition as one unit and must not
enable dual writes or a per-runtime vendor fallback. Startup never auto-deletes
a corrupt or unsupported database. Restore failures preserve the original row
for retry and diagnosis.

## References

- `docs/adr/0005-conversation-catalog-and-runtime-recovery.md`
- `docs/adr/0025-exact-acp-session-recovery.md`
- `docs/plans/2026-08-27-electron-acp-runtime-integration.md`

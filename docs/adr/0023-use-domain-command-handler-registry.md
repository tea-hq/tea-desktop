# ADR-0023: Use a domain command handler registry

## Status

Accepted

## Context

The Electron renderer invokes one allowlisted `tea:command` IPC endpoint. The
main-process entry point currently dispatches all 55 commands through one
`switch` in `electron/main.ts`. That entry point consequently owns input
validation, cross-service workflows, service lookup, and command dispatch in
addition to process composition and lifecycle.

The IPC command names, preload allowlist, service behavior, stable error codes,
and shutdown behavior must remain unchanged. Missing or duplicate command
registrations must fail during application startup rather than silently route
to the wrong service. The solution should remain straightforward to test and
must not introduce another framework.

## Decision

Use a lightweight Command pattern implemented as functions:

- A shared command router validates command names and argument envelopes.
- Domain modules expose handler maps for workspace, conversation, catalog and
  plugin, and channel commands.
- Router construction rejects duplicate handlers and requires exactly one
  handler for every `DesktopCommand`.
- Domain handlers validate command-specific input and delegate to Electron main
  application services. Cross-service workflows stay in the owning domain
  handler module.
- `electron/main.ts` remains the composition root for services, IPC, windows,
  initialization, and shutdown.

## Consequences

### Positive

- Command growth no longer expands the process entry point.
- Each domain has a focused, independently testable IPC adapter.
- Missing and duplicate handlers become startup configuration errors.
- Existing renderer, preload, service, and error contracts remain stable.
- Adding a command requires an allowlist entry and a handler registration.

### Negative

- The routing layer gains several small files and a startup completeness check.
- Handler argument types remain runtime-validated records until the IPC contract
  gains command-specific input and output mappings.

### Neutral

- Service implementations and durable state ownership do not move.
- The single `tea:command` transport remains unchanged.

## Alternatives Considered

**Split the switch into smaller switches**

Rejected because it moves the branching without preventing missing or duplicate
command ownership and leaves dispatch coupled to control flow.

**Create one class per command**

Rejected because the handlers are stateless adapters. Fifty-five command
classes would add lifecycle and naming ceremony without useful polymorphism.

**Use an event bus or dependency-injection framework**

Rejected because command execution is request/response, ordering is explicit,
and the current application does not need runtime handler discovery.

## References

- `electron/main.ts`
- `src/types/electronBridge.ts`
- `AGENTS.md` ownership and dependency direction

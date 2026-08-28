# Center-Managed Agent Roles With Extensible Capability References

## Status

Accepted for phase one implementation.

## Context

Tea Desktop needs selectable Agent roles that compose prompts, runtime/model
choices, and future Skills, MCP servers, and Tools. The Desktop currently has a
process-local role repository and a minimal management view. Skills, MCPs, and
Tools do not yet have released catalogs or execution contracts, so treating
them as runnable features now would create a second source of truth and force
premature compatibility behavior.

## Decision

Tea Center owns tenant-scoped Agent Role records, visibility authorization,
audience references, and immutable revisions. Desktop synchronizes a full,
authenticated projection after login and caches it per tenant and subject.
Desktop sends only a typed role reference (`roleId`, `revision`) when creating a
conversation; the host/runtime resolves and validates the revision before
starting execution.

Role revisions contain typed, versioned capability references for `skill`,
`mcp`, and `tool`. Phase one validates their shape and preserves them, but does
not execute or silently discard unsupported references. A role with unsupported
dependencies is explicitly unavailable for new conversations. Credentials,
executable paths, copied manifests, and runtime session state never enter a
role record or Desktop webview projection.

Visibility is `tenant`, `private`, or `restricted`. The `audienceRefs` field is
present from the first schema so a future organization directory can authorize
users, groups, or departments without changing the role identity model. The
first Desktop editor exposes tenant/private choices and keeps restricted
selection unavailable until the directory contract exists.

## Alternatives considered

1. Keep roles local to Desktop. Rejected because tenant visibility, revocation,
   and multi-device consistency require a server authority.
2. Implement Skills/MCP/Tools together with roles. Rejected because their
   catalogs and lifecycle contracts are not yet defined; this would produce
   fake pickers and unstable execution semantics.
3. Store a copied, fully resolved role in each conversation. Rejected as a
   durable source of truth; conversations retain the role reference and the
   runtime-owned resolved snapshot only.

## Consequences

The first release can ship role metadata, prompts, visibility, synchronization,
and editing independently of capability execution. The UI must represent
configured-but-unavailable dependencies and provide clear recovery paths.
Later capability catalogs can plug into the same reference list and readiness
projection without changing role identity or visibility authorization.

## Migration, rollback, and recovery

This is pre-1.0 WIP data. Development schemas and local caches may be recreated
from the new model; no legacy reader or alias is required. Rolling back removes
the role API and Desktop projection together. If Center is unavailable after a
successful sync, Desktop may display stale cached metadata but must mark it
stale and must not extend its authorization lifetime beyond the configured
cache policy.

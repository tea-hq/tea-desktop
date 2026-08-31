# ADR 0029: ACP Session Delete And Tea-Local Archive

## Status

Accepted

## Context

Tea exposes conversation archive and delete actions, but ACP does not define a
standard `session/archive` method. ACP does define `session/delete`, guarded by
the negotiated session delete capability. ACP `session/close` only releases
runtime resources and must not be treated as deletion. Adapter implementations
may map delete to their own retention behavior, so the protocol operation is
the strongest portable delete request, not a guarantee of physical erasure.

## Decision

- `archive` remains a Tea-local soft state represented by `archived_at` in the
  main-process conversation catalog. It never calls ACP.
- `deleteConversation` is added to the Electron `ConversationRuntime` port.
  The ACP runtime checks the persisted binding identity and negotiated delete
  capability, then sends `session/delete` with the opaque native session id.
- An active session uses its actor directly. An inactive session is deleted by
  opening a temporary ACP connection with the binding's exact wire version,
  workspace, artifact identity, and provider selection. It does not call
  `session/load` or `session/resume`, and it does not attach HostTools.
- A successful Agent delete is required before the catalog row is removed.
  Agent failures, unsupported capabilities, and local catalog failures leave
  the row available for retry. Runtime resources and subscriptions are cleaned
  up after an attempted delete, while the primary failure is preserved.
- Normal shutdown continues to use `session/close` only when the Agent
  advertises close support; close is never substituted for delete.

## Consequences

The renderer stays unaware of ACP method names and invokes the existing typed
conversation client delete action. Deleting a conversation can fail when an
Agent does not advertise deletion or when its provider cannot be recreated;
the catalog remains visible so the user can retry. Product copy describes
removal from Tea rather than promising physical deletion from an Agent's
backend.

## Verification

Capability normalization, active and inactive V1/V2 deletion, unsupported
capabilities, binding validation, service ordering, and sidebar action flow are
covered by deterministic Vitest tests. The runtime catalog and ACP IPC testing
matrices document the acceptance cases.

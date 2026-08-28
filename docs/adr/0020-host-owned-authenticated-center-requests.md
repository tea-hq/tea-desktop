# ADR 0020: Host-Owned Authenticated Center Requests

## Status

Accepted.

## Context

Desktop features call authenticated Tea Center endpoints for runtime
configuration, tenant directory data, and Agent Role synchronization. The first
directory implementation read the current access token directly and surfaced a
`recoveryRequired` error as soon as Center rejected an expired token. Runtime
configuration contained its own refresh-and-retry state machine, while Agent
Role synchronization also obtained the raw token. This duplicated session
lifecycle policy and allowed feature services to depend on credential facts
owned by authentication.

Concurrent feature requests can observe the same expired access token. If they
refresh independently, a rotated refresh credential can be consumed more than
once and revoke an otherwise recoverable session.

## Decision

`CenterAuthService` exclusively owns access tokens, refresh credentials,
session rotation, and authenticated retry policy. Feature services request
typed Center resources and never receive a token.

All authenticated Center requests use one executor with these semantics:

1. Require an authenticated or offline-cached session.
2. Send the request with the current in-memory access token when available.
3. On `recoveryRequired`, refresh the endpoint session and retry the original
   request exactly once.
4. Serialize refresh attempts. A waiter reuses a token already rotated by the
   first request instead of refreshing again.
5. Preserve the session on transient Center unavailability.
6. Invalidate credentials and cached identity only for non-transient,
   non-cancellation failures after recovery is exhausted.

Entering a protected feature while offline-cached triggers the same recovery
path. If Center is reachable, the session becomes authenticated and the
request proceeds. If Center remains unavailable, the cached identity is
preserved and the feature reports unavailability.

## Alternatives

- Refresh in each feature service. Rejected because it duplicates credential
  lifecycle and permits refresh races.
- Expose a token getter to features. Rejected because tokens are host-owned
  secrets and feature code cannot apply revocation and recovery consistently.
- Refresh before every request. Rejected because it adds unnecessary traffic
  and increases refresh credential rotation risk.

## Consequences

Runtime configuration, directory loading, and Agent Role synchronization share
one recovery contract. New authenticated Center capabilities must be added as
typed `CenterAuthService` operations backed by the executor. The WebView never
receives access or refresh credentials.

## Migration, rollback, and recovery

This replaces the duplicated WIP request paths directly; no compatibility
branch is retained. Rollback restores endpoint-specific request handling.
Users with revoked refresh credentials still require a new login. Transient
Center outages preserve the last cached identity and refresh credential.

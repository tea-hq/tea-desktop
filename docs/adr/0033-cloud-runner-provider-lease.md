# ADR 0033: Cloud Runner Provider Credential Lease

## Status

Accepted for the WIP cloud runner implementation.

## Decision

Center creates a short-lived provider lease when it dispatches a cloud
conversation start. The lease is bound to the tenant, the runner registration
token, and the selected runtime/provider/model. The runner exchanges the lease
over `POST /v1/runner/provider-lease`, authenticating with its registration
token. Center returns the provider base URL and credential only in that
response.

The WebSocket command carries only the opaque lease token. Provider
credentials are held in memory by the runner and are translated into the
official ACP environment variables immediately before launching the ACP
process. Credentials are not written to runner configuration, command/event
payloads, durable conversation state, or runner logs.

## Consequences

- A runner must be able to reach Center over HTTPS in addition to its existing
  WebSocket connection.
- A revoked registration token immediately prevents new provider lease reads.
- Leases are intentionally ephemeral and are recreated for a new dispatch;
  active ACP processes retain their in-memory environment during a temporary
  disconnect.
- Provider capability synchronization remains out of scope. If the selected
  runtime/provider/model is unsupported or malformed, the runner reports a
  terminal conversation failure.

## Recovery

Lease lookup failures are reported through the normal `conversation.failed`
event and the queued prompt for that conversation is ignored. No retry loop is
started for the failed conversation. A subsequent user-created conversation
gets a new lease after Center and the runner are available again.

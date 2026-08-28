# ADR 0015: Use A Loopback Callback For Desktop OIDC Handoff

- Status: Accepted
- Date: 2026-08-25

## Context

Tea Desktop currently asks Center to redirect a successful enterprise OIDC
login to `tea-desktop://auth/complete`. Packaged applications can register that
scheme, but a macOS `tauri dev` process is not an application bundle and cannot
register it dynamically. Tauri reports runtime scheme registration as
unsupported on macOS. The browser therefore completes OIDC while the Desktop
host never receives the handoff code.

Authentication must work through the same host-owned flow in development and
packaged builds. The callback must not expose provider codes, endpoint tokens,
refresh credentials, or device private keys, and a caller must not be able to
redirect Center to an arbitrary network destination.

## Decision

Desktop binds an ephemeral IPv4 listener on `127.0.0.1` before creating a
Center desktop-login transaction. It generates a 32-byte random callback nonce
and declares exactly this callback shape:

```text
http://127.0.0.1:<ephemeral-port>/auth/complete/<base64url-nonce>
```

Center accepts only that shape: literal `127.0.0.1`, HTTP, an explicit non-zero
port, no user information, query, fragment, alternate loopback address, DNS
name, or encoded path ambiguity. Center stores the validated callback URL on
the server-owned desktop transaction. After OIDC membership resolution it
issues the existing short-lived handoff code and appends only `transaction` and
`code` query parameters with the standard URL API.

The Desktop listener accepts one bounded GET request whose path and query have
the exact expected shape. It sends the values directly to the Rust-owned
session exchange, returns a no-store completion page, and shuts down. It times
out with the desktop transaction and is cancelled when the owning login flow is
replaced or the application exits.

A host-managed `LoginTaskCoordinator` owns at most one callback task. Starting
a login reserves a new monotonic authentication generation and cancels the
previous task before binding or contacting Center. The service checks that
generation before installing a pending transaction, accepting an exchange,
persisting a rotated refresh credential, replacing the safe cache, or emitting
authenticated state. The cancel command and logout both invalidate the active
generation and close the loopback listener.

The handoff code remains protected by the verifier retained only in Desktop and
the Ed25519 proof bound to the original transaction. The loopback port and
nonce are routing and request-correlation controls, not authentication factors.
Vue never receives the callback URL, nonce, code, verifier, or device material.

Custom URI scheme registration and deep-link plugins are removed from this
authentication flow.

## Consequences

### Positive

- Development and packaged applications use one callback mechanism.
- Login no longer depends on OS application registration or browser handling
  of custom schemes.
- Center cannot be used as a general redirector or SSRF client because only a
  literal local callback is accepted and Center returns it to the browser.
- Existing verifier, device-proof, expiry, and single-use guarantees remain.

### Negative

- Desktop must own a short-lived local HTTP server and its cancellation.
- Local endpoint-security software may block loopback listeners; this becomes
  a typed callback failure rather than a browser white screen.
- The callback URL becomes part of the pre-release desktop transaction schema.

### Neutral

- The provider callback remains the public Center
  `/auth/oidc/callback`; tenant OIDC configuration does not change.
- This is a WIP contract replacement. The initial Center schema is updated
  directly and no compatibility field or historical migration is retained.

## Alternatives Considered

### Keep The Custom Scheme And Generate A Development App Wrapper

Rejected because it makes local correctness depend on macOS LaunchServices,
creates a second-instance forwarding path, and still differs from ordinary
`tauri dev` process ownership.

### Poll Center For Browser Completion

Rejected for this iteration because it adds a second authenticated retrieval
endpoint, poll credential, rate limiting, and more server state. It remains a
possible fallback for environments that prohibit loopback listeners.

### Require Packaged Builds For Login Testing

Rejected because it makes the primary authentication workflow impractical to
develop and debug.

## Failure And Recovery

- Bind failure aborts before a Center transaction is created.
- Invalid path, duplicate parameters, oversized queries, and unsolicited
  requests do not trigger exchange.
- Timeout closes the listener and returns Desktop to a retryable signed-out
  state.
- Explicit cancellation closes the listener, reports `loginCancelled`, and
  leaves the enterprise domain editable for retry.
- A callback for a replaced transaction is rejected and cannot consume the new
  verifier.
- A successful exchange that completes after cancellation is revoked and is
  never persisted locally.
- Exchange and bootstrap failures keep their existing typed recovery behavior.

## References

- RFC 8252, OAuth 2.0 for Native Apps, loopback redirect URI
- `docs/adr/0014-center-endpoint-bootstrap.md`
- `../tea-center/docs/protocol/desktop-auth.md`

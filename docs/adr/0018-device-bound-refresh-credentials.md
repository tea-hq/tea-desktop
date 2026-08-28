# ADR 0018: Device-Bound Refresh Credentials

## Context

Center refresh credentials were bearer credentials. Possession of a copied credential was sufficient to restore the associated endpoint session from another host, even though the initial desktop handoff required an Ed25519 device proof.

## Decision

Center-issued refresh credentials use the versioned shape `v1.<random-secret>.<device-public-key-ref>`. Every refresh request includes an Ed25519 proof whose key id matches the credential's public-key reference. The exact signed bytes are:

```text
tea-center-refresh-v1\n<complete-refresh-credential>
```

Center validates the proof before consuming or rotating the credential. A rotated credential remains bound to the same public key. The rotating credential itself is the one-time challenge, so no clock synchronization or additional challenge endpoint is required.

Legacy bearer-only refresh credentials are rejected. Affected clients clear their local session and complete OIDC login again. No compatibility branch is retained for the unreleased protocol.

## Alternatives

- Comparing a caller-provided device id does not prove possession and can be spoofed.
- A separate nonce endpoint adds latency and server state without improving replay resistance over the existing one-time rotating credential.
- Storing the public key in `endpoint_sessions` is workable but requires a persistence change. Binding it into the hashed credential keeps the repository contract unchanged while preserving cryptographic binding.

## Consequences

- Copying only the refresh credential is insufficient to restore a session.
- Captured signed refresh requests cannot be replayed after successful rotation; existing refresh reuse detection still revokes the session on reuse.
- Security still depends on protection of the device private key. Desktop stores that key in the OS credential facility; hardware-backed, non-exportable keys remain a future hardening option.
- Existing refresh credentials require a new OIDC login after deployment.

## Rollout, Rollback, And Recovery

Deploy Center and the updated Desktop together. Center rejects old refresh requests, causing deterministic reauthentication rather than silent downgrade. Rollback requires rolling both components back; newly issued `v1` credentials are intentionally not accepted by the old bearer-only contract. Users recover by clearing the rejected local credential and completing OIDC login.

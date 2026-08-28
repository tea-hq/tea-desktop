# ADR 0017: OIDC-Owned Self Profile With IM Verification

## Status

Accepted

## Context

Center creates tenant-scoped Yunxin accounts after OIDC login, but the initial
runtime contract carried only the internal user id. Yunxin accounts were
created with `accid` and `token`, so the Desktop could not verify whether the
IM profile matched the authenticated enterprise identity.

## Decision

Center's identity directory owns authenticated self-profile facts. It stores a
bounded projection of OIDC UserInfo claims and refreshes that projection on
successful login. Authorization continues to use only issuer, subject, Center
membership, and tenant status; display claims never grant access.

The endpoint bootstrap exposes an allowlisted self profile scoped from the
endpoint session. Runtime provisioning sends the display name, profile email,
and validated HTTPS avatar URL to Yunxin. Existing accounts refresh those
fields through Yunxin's profile update endpoint. Email verification remains a
separate assertion and is displayed independently from the email value.

Desktop obtains the live IM profile through a provider-neutral channel
transport capability. A profile feature compares Center and live IM values;
Vue does not call the Yunxin SDK or Tauri commands directly.

## Security

Profile fields are length-bounded and control characters are rejected. The
email returned by the authenticated UserInfo endpoint is profile metadata even
when the provider omits `email_verified`; it never grants membership or admin
access. High-assurance policy continues to use only a separately verified
email assertion. Avatar URLs must be absolute HTTPS URLs without credentials. AppSecret, IM token,
endpoint access token, and raw provider errors never enter bootstrap profile
data, the profile store, WebView logs, or rendered diagnostics.

## Consequences

The self-profile screen can distinguish a stale or failed IM synchronization
from an OIDC mapping problem. The retained sidecar transport reports the
capability as unsupported until its versioned protocol implements an
equivalent query.

## Migration, Rollback, And Recovery

Tea Desktop and Center are WIP, so user profile columns are added directly to
the initial schema and deployments recreate PostgreSQL. Rollback removes the
new bootstrap fields and profile capability together. A failed Yunxin profile
refresh leaves the Center identity intact and is retried by a later runtime
configuration request.

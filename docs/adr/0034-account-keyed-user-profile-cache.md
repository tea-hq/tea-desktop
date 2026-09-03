# ADR 0034: Account-Keyed User Profile Cache

- Status: Accepted
- Date: 2026-09-03

## Context

Several surfaces need the same IM user identity: the workspace profile, agent
conversation list, channel messages, and the directory. Keeping a name or
avatar beside each component causes inconsistent fallbacks and repeated
provider requests. The profile data is authoritative in the connected IM
UserService, while Vue and Pinia must remain independent of a specific IM SDK.

## Decision

Expose `getUserProfiles(accountIds)` through the provider-neutral channel user
profile port. Each transport owns its provider mapping and validation; the
Yunxin adapter is the only layer that calls `V2NIMUserService`.

`useChannelUserProfileStore` is the single renderer cache. It indexes profiles
by normalized `accountId`, batches up to 100 missing accounts, shares in-flight
requests, and rejects stale responses when the transport or workspace changes.
Direct channel summaries retain their provider-neutral participant account id so
the workspace can prefetch those profiles into the same cache. The cache is
memory-only and is cleared on workspace disposal. Components only consume the
cache projection and never fetch or own profile state.

Default Avataaars are display-only fallbacks. Their seed is the account id,
their background can be selected through the generator options, and the
Avataaars palette is fixed to the yellow skin tone (`#f8d25c`) and black hair
(`#2c1b18`) for a consistent appearance. Unsafe accessory/facial variants are
excluded as well.

## Consequences

Profile, directory, and channel message surfaces share identity data and remain
consistent across real and preview transports. Agent session lists intentionally
do not consume user profile data because those rows represent Agent sessions,
not people. A provider can implement the user profile port without changing the
cache or components. A deterministic local avatar is rendered only when a
trusted IM account id is available; an unknown account stays a neutral initials
placeholder. Transport failures do not invalidate the Center identity.

## Migration, rollback, and recovery

The profile cache is not persisted, so no data migration is required. Existing
`getSelfProfile` callers remain as a convenience API backed by the same
provider capability. Rollback removes the cache wiring and restores per-surface
fallbacks. Reconnection retries visible account ids after the transport returns
to `connected`.

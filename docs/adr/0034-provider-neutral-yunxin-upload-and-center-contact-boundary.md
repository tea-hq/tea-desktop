# ADR 0034: Provider-Neutral Yunxin Upload and Center Contact Boundary

- Status: Accepted
- Date: 2026-09-02
- Amends: ADR 0008 and ADR 0033

## Context

Tea is an enterprise collaboration IM. Tea Center owns the people directory,
while Yunxin owns group conversations and their membership. The two systems
must describe the same people: an account that is not present in the Center
directory is not a valid Tea IM recipient. Yunxin also needs a local friend
relation before a P2P conversation can be opened or a message can be sent.

Tea currently uses the Yunxin Web SDK in Electron main. A future native N-API
implementation is expected to expose similar operations, so SDK DTOs, file
handles, credentials, and upload callbacks must not become renderer contracts.

## Decision

Keep the stable `ChannelTransport` domain port unchanged when changing Yunxin
implementations. The adapter owns SDK construction, login, message creation,
provider error mapping, and provider event subscription. `ChannelContactDirectory`
is a provider-neutral main-process dependency used by the channel adapter before
P2P, group creation, and group invitation operations.

`ElectronCenterAuthService` is the directory implementation. It validates the
schema, tenant, unique Center user IDs, unique Yunxin accounts, provider name,
required status, bounded text, and safe avatar URLs before returning a
`DirectoryUser`. The adapter rejects an unknown account with the stable
`invalidRequest` error before calling Yunxin. For a known P2P account it checks
the Yunxin friend relation and calls `addFriend({ addMode: 1 })` when needed;
the operation does not wait for consent.

`NodeYunxinUploadAdapter` is an Electron-only implementation of the SDK upload
callback. It validates an absolute local path, short-lived NOS token, host
allowlist shape, and size; streams a bounded multipart request; reports bounded
progress; supports abort; and exposes only the allowlisted attachment metadata.
The SDK remains responsible for obtaining upload credentials and creating its
provider message. A native N-API adapter can replace this class at the
`NodeYunxinUploadPort` boundary without changing Vue, stores, or domain types.

## Invariants

- Center directory is the people source of truth; Yunxin is the group/member
  source of truth.
- Every P2P, group-create, and group-invite target is validated against Center
  before Yunxin is called.
- P2P friend creation uses no-consent mode and is idempotent for existing
  friends.
- Paths, NOS tokens, SDK objects, binary data, and credentials never cross the
  preload or renderer boundary.
- Upload responses are bounded and parsed through a metadata allowlist; unknown
  provider fields are discarded.
- Upload cancellation produces a stable retryable transport failure and always
  releases the opaque attachment token after the send operation finishes.

## Failure, recovery, and migration

An unavailable Center directory maps to a retryable transport failure. A valid
Center response that omits a requested account maps to non-retryable
`invalidRequest`. Yunxin friend, group, or upload failures retain the adapter's
stable error mapping and do not fabricate local success. Directory reads use a
30-second in-memory cache scoped to the authenticated tenant. Concurrent reads
for the same tenant and cache generation share one request; explicit refresh,
logout, bootstrap replacement, and session invalidation clear the cache. A
request from an old tenant or generation may finish, but it can never refill
the active cache.

Replacing the Web SDK with N-API requires a new `YunxinSdkFactory` and, where
necessary, a new `NodeYunxinUploadPort` implementation. The renderer-facing
contracts, Center directory validation, attachment token lifecycle, event
ordering, and error codes remain the compatibility boundary. No provider DTOs
or compatibility aliases are introduced.

## Testing consequences

Contract tests cover unknown direct recipients, automatic friend creation,
Center validation before group operations, multipart upload metadata/progress,
backup-host retry, cancellation, bounded directory response parsing, cache TTL,
concurrent request coalescing, and forced refresh. A future N-API implementation
must pass the same transport contract tests and replace only adapter-specific
protocol fixtures.

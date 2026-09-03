# ADR 0042: Provider-Neutral Contact Presence

- Status: Accepted
- Date: 2026-09-03

## Context

Tea needs live availability for direct-message contacts without making Yunxin
subscription objects part of the application contract. Tea Center is the
authoritative contact directory, while Yunxin owns IM delivery, groups, and
group membership. An account that exists only in Yunxin is a synchronization
bug and must not become a discoverable contact through presence.

The current Yunxin Web SDK publishes provider-specific status types, client
types, timestamps, and JSON extensions. Tea may later replace that adapter
with a native N-API implementation. Subscription limits, SDK event names, and
multi-client parsing therefore belong below a provider-neutral port rather
than in Electron IPC, stores, or Vue components.

Presence also expires independently from durable conversations. Persisting it
would make stale availability look authoritative after restart and create a
second source of truth beside the active provider subscription.

## Decision

`ChannelTransport` exposes replace-set presence subscriptions and emits only
provider-neutral events. Application types contain an account id, one of
`online`, `offline`, or `unknown`, and a provider timestamp. The transport
advertises the capability as `presence.subscribe`; consumers do not branch on
the provider name.

The channel store owns the desired set and renderer projection. It derives a
sorted, unique target set only from synchronized direct conversations that
have a `directAccountId`. Group conversations never enter the set and never
display presence. Catalog changes replace the desired set. Reconnect clears
the transient projection and rebuilds subscriptions from the current direct
conversation catalog. Components receive projected values and emit no
subscription commands.

The Yunxin adapter validates the complete replacement set against Tea Center
before changing any provider subscription. A request is rejected atomically
when any account is absent from the Center directory. Inputs are bounded to
3,000 unique accounts, 512 characters per account, and no control characters.
The adapter diffs the validated set, unsubscribes removals first, and issues
provider calls in batches of at most 100 accounts.

Subscriptions last 30 minutes and are renewed after 20 minutes. Initial
subscriptions request an immediate status replay; renewals do not. A partial
provider failure preserves the known successful subset and emits the stable,
retryable `presenceSubscriptionFailed` error. The desired set remains
authoritative so a later replacement or renewal can reconcile it again.

Provider mapping stays inside the adapter. Login means online. Logout or
disconnect means online only when bounded structural JSON parsing finds a
nonempty `serverExtension.online` array representing another active client;
malformed or absent data maps to offline. An unknown predefined status maps to
unknown. Custom statuses are ignored and cannot overwrite availability. When
one provider batch contains multiple records for an account, the latest
timestamp wins, with a deterministic availability priority only for equal
timestamps.

Electron main validates the bounded string array and delegates through the
existing context-isolated channel command boundary. Preload exposes one typed
command and forwards provider-neutral channel events through the existing
allowlist. No SDK object, event name, raw IPC handle, credential, contact
profile, or server extension crosses into the renderer.

## Ordering, Cancellation, And Recovery

Adapter and store operations are serialized. Lifecycle and presence
generations invalidate work from an earlier connection or account. The store
accepts events only for current desired accounts and ignores values whose
timestamp is not newer than its projection. The adapter emits only for
accounts that are both desired and known subscribed.

Disconnect, kicked-offline, account replacement, transport disposal, and
listener rebinding cancel renewal, detach the provider listener, clear desired
and subscribed adapter state, and clear the renderer projection. Late command
results and late provider events cannot repopulate the next lifecycle. A
reconnect starts from `unknown` until the immediate provider replay or a new
event supplies current availability.

Presence is never written to the conversation catalog, channel draft catalog,
renderer storage, logs, or Tea Center. A process restart therefore recovers by
loading durable direct conversations and creating a fresh validated
subscription set. Failure to restore presence does not corrupt or roll back
the conversation catalog; the UI remains usable with `unknown` availability
and a stable store error code.

## Versioning And Replacement

This is the initial pre-1.0 transient contract, so no compatibility alias or
provider fallback is added. A future contract change must define event
ordering, capability negotiation, downgrade behavior, and removal criteria
before changing renderer-visible fields.

Replacing Yunxin Web with N-API requires an adapter that preserves replace-set
semantics, Center validation, capacity bounds, successful-subset tracking,
renewal, cancellation, stale-event rejection, timestamps, and stable errors.
Provider-specific limits may be stricter inside that adapter, but they must not
leak upward or silently weaken the application invariants.

## Consequences

- Tea Center remains the only authority for who may appear as a direct contact.
- Presence stays fresh-by-subscription rather than becoming misleading durable
  state.
- Stores and components remain unchanged when the SDK implementation changes.
- Group presence and richer custom availability require separate contracts;
  they cannot be inferred from Yunxin extension fields in the renderer.

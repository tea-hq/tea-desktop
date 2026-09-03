# ADR 0033: Provider-Neutral Message Content

- Status: Accepted
- Date: 2026-09-02
- Amends: ADR 0008

## Context

Tea is an enterprise collaboration IM. The Yunxin UIKit reference surface is
not text-only: it includes media, locations, calls, notifications, custom and
robot messages, forwarding, replies, mentions, reactions, pins, collections,
search, and group workflows. The existing `Message` contract retained only
`text`, and the Yunxin adapter requested `messageTypes: [0]`, silently dropping
every other message type.

Tea may later replace the Yunxin Web SDK with a native N-API implementation.
The renderer, stores, Agent source model, and use cases therefore cannot
depend on Yunxin enums, attachment classes, `File` objects, or SDK lifecycle
objects.

## Decision

Add a serializable `MessageContent` discriminated union to the channel domain.
It models text, image, audio, video, file, location, notification, call,
custom, robot, tips, AV chat, unknown provider types, and revoked content.
Media content contains bounded metadata and an optional HTTPS URL; local file
handles and upload progress remain transport concerns. `Message.text` remains
the bounded display projection used by existing timeline surfaces, and is
derived from `Message.content` by the shared `messageContentToText` helper.

`YunxinWebChannelTransport` and its mapper own all SDK-specific numeric type
values and attachment shapes. The mapper accepts a structural content source so
conversation summaries and a future N-API adapter can reuse the normalization
rules without importing SDK types into the domain. Unsupported numeric types
become an explicit `unknown` value rather than being discarded.

Outgoing media uses an opaque `ChannelAttachment` token. A platform picker
returns only the token and bounded metadata (`name`, `mimeType`, `size`, and
media kind). Electron keeps the selected path in a short-lived main-process
map and the Yunxin adapter resolves the token immediately before invoking the
SDK message creator. Tokens expire, are released after send completion, and
are never persisted or logged. Browser preview uses the same contract with a
local synthetic token and the mock transport.

Media upload progress is reported as a bounded `message.sendProgress` event
keyed by an operation id. Cancellation marks that operation before the
provider callback runs; the adapter converts provider rejection into the
stable retryable transport error. A future native N-API adapter can replace
the resolver and upload implementation without changing the renderer, store,
or message contract.

Agent history and Channel-to-Agent source conversion use the same helper. They
receive bounded display text and safe media labels/metadata, never raw SDK
objects, credentials, binary bytes, or unbounded custom payloads. Revocation
replaces content with `redacted` before it reaches either projection.

`ChannelTransport` capabilities continue to describe command and event
availability independently. Message mutation, media upload, forwarding,
contacts, and group management are added as typed ports; a capability that is
not implemented by the active adapter is reported as unavailable rather than
reconstructed in Vue.

## Invariants

- Every non-deleted provider message maps to exactly one `MessageContent`.
- Domain values are JSON-serializable and bounded at the adapter boundary.
- Provider replacement changes only the adapter and its contract tests.
- Agent summaries are deterministic and cannot reveal attachment bytes or raw
  custom payloads.
- A revoked message has no recoverable display content in the projection.

## Migration and rollback

This changes the unreleased in-memory message contract directly; no aliases or
persisted migration are required. Existing text fixtures construct
`{ kind: 'text', text }` content, and the mock transport exercises the same
projection as Yunxin. Rolling back means selecting the mock/previous adapter
at composition time; it does not restore provider objects to the store or
renderer.

## Consequences

The timeline can progressively add dedicated renderers for each content kind
without another domain migration. Until those renderers land, the derived
text projection keeps previews and Agent collaboration readable. Adapter code
is more deliberate, but replacing Yunxin with N-API does not change feature
stores, Vue components, or Agent contracts.

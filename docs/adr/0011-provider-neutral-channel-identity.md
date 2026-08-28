# ADR 0011: Provider-Neutral Channel Identity

- Status: Accepted
- Date: 2026-08-22

## Context

The real channel transport maps the Yunxin computed conversation name into `Channel.name`, but drops the computed avatar. The conversation list therefore renders generated symbols even when the provider supplies a user or group avatar. It also exposes the encoded conversation id when the provider name is temporarily absent, which is common in a newly created group callback.

The reference Yunxin UIKit resolves P2P aliases and user profiles through MobX stores and renders group identity from the conversation object. Tea Desktop must improve identity presentation without importing UIKit state ownership, Vue components, global SDK access, or provider-specific types into its stable channel contract.

## Decision

Add optional `avatarUrl` to the serializable provider-neutral `Channel` DTO.
The Yunxin Web transport maps the SDK-computed `name` and `avatar` immediately
and supplies the SDK-parsed target id as the bounded fallback name. Vue
components render only the provider-neutral DTO and never call user, friend,
team, storage, or conversation SDK services.

When a group `onConversationCreated` callback lacks either name or avatar, the transport performs one authoritative `getConversation` refresh before emitting the channel. If the refresh fails, it emits the original conversation through the normal bounded mapper so the list remains usable. Later `onConversationChanged` events continue to update the same normalized projection.

The list uses the provider avatar when it loads successfully. Missing and failed images use bounded initials derived from `Channel.name`, with stable neutral presentation derived from `ChannelRef`. This is display-only state and does not become a channel fact.

The Tauri image CSP permits HTTPS images only from the confirmed Yunxin/NetEase CDN domain families. Arbitrary remote avatar origins remain blocked and therefore use the same local fallback.

## Alternatives considered

Copying UIKit's friend, user, and team MobX stores was rejected because it duplicates provider state and violates the transport boundary. Querying profiles from Vue was rejected because it exposes SDK lifecycle and provider identifiers to components. Adding a general participant-directory port was rejected because phase one only requires conversation identity and does not yet include contact management. Continuing to display generated symbols was rejected because it discards authoritative data already returned by the SDK.

## Consequences

All transports and fixtures may provide an avatar without changing store behavior. A future `TauriChannelTransport` can populate the same DTO field. The Yunxin adapter performs at most one extra request for an incomplete newly created group, while ordinary list pages and change events remain request-free.

The SDK documents conversation name and avatar as computed fields but does not guarantee that the name always reflects the latest friend alias. Exact alias parity remains a future transport-owned enhancement that would require bounded profile/friend caches and symmetric events; this decision does not introduce those services.

## Migration, rollback, and recovery

`avatarUrl` is optional, so existing in-memory channels and mock implementations remain valid while fixtures are updated incrementally. No persisted channel identity exists and no data migration is required. Rollback removes the optional field and restores the generated symbol renderer. On refresh failure or image load failure, deterministic local fallbacks preserve selection and channel access; later provider events recover the authoritative identity.

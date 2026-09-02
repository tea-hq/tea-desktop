# ADR 0008: Provider-Neutral Real Channel Transport

- Status: Accepted; credential activation amended by ADR 0016; message scope amended by ADR 0033
- Date: 2026-08-21

This document records the WebView provider integration. ADR 0016 replaces its
manual credential and build-time AppKey decisions with Center-managed
activation while retaining the Web SDK transport.

## Context

The channel and Agent workspaces introduced in commit `16d2bc6` render fixture data directly from a Pinia store. The store embeds messages inside channels, clears unread counts locally, and marks a draft sent without contacting a channel provider. Those shortcuts cannot support authoritative read state, reconnect recovery, provider event ordering, or a future Rust SDK transport.

Phase 1 must integrate `nim-web-sdk-ng` 10.9.81 for P2P and group conversations while keeping provider objects and credentials outside the domain and view layers. The SDK is authoritative for conversations, messages, receipts, pins, quick comments, and read state. The current provider runs in the WebView; a future Rust SDK will run behind Tauri IPC.

## Decision

Introduce a serializable `ChannelTransport` port with descriptor/capabilities, lifecycle, channel pagination, message pagination, text send, mark-read, subscription, and disposal operations. Stable domain names are `ChannelRef`, `MessageRef`, `Channel`, `Message`, `Participant`, `ChannelPage`, `MessagePage`, `ChannelEvent`, `ChannelCapability`, `AgentTask`, and `Draft`.

`YunxinWebChannelTransport` owns every `nim-web-sdk-ng` object and enum. It maps SDK results and callbacks immediately into bounded provider-neutral values. `MockChannelTransport` implements the same contract for browser preview and deterministic tests. A later `TauriChannelTransport` may replace either implementation without changes to stores, components, Agent tasks, or drafts.

The channels Pinia store owns only a normalized in-memory projection: channels keyed by `ChannelRef`, messages grouped by channel, and bounded ordered message queues deduplicated by client or server message ID. Historical pages and real-time events reduce through the same projection. Delete, revoke, modify, clear-history, pin, receipt, and read events update existing projected values; they do not create competing facts.

## Agent task and draft lifecycle

An `AgentTask` starts from exactly one `MessageRef`. Context expansion is a bounded `loadMessages` request owned by the task use case, not Vue prompt construction. Agent output becomes an editable `Draft` in review state. Only explicit approval can call `sendMessage`.

Agent-originated sends use a JSON `serverExtension` envelope with schema version, identity, `taskId`, `draftId`, and `idempotencyKey`. The store records the successful provider client/server IDs. Approval is idempotent: an in-flight or completed key cannot issue a second provider send. Rejected drafts remain in memory for review but are never sent.

## Security

Center supplies app key, account, and token through the authenticated runtime
configuration. Rust validates and stores the managed response, then exposes
only the ready IM credential through a dedicated command immediately before
SDK login. The WebView transport keeps it in temporary memory only and never
logs, persists, emits, or adds it to Agent context. Browser preview always uses
mock credentials internal to the mock transport.

Text, pages, extensions, nesting depth, arrays, message content metadata, and queued events are bounded before entering the projection. Unsupported provider capabilities remain explicitly unavailable until their typed contract is verified; supported content is normalized by the mapper described in ADR 0033. CSP permits only self/Tauri endpoints plus the confirmed Yunxin LBS and secure link endpoints; arbitrary network origins remain blocked.

## Recovery and lifecycle

Listeners are registered before login and removed symmetrically on disconnect/dispose. Reconnect events trigger an authoritative channel refresh while SDK sync events bound refresh timing. Duplicate callbacks are harmless because reducer identities are stable. Kicked-offline, authentication failure, account switch, explicit disconnect, and disposal clear all provider caches and projected channel/message state. Tokens never participate in replay.

Quick comments may be declared unavailable by an adapter until the exact SDK mutation contract is verified and covered by contract tests. This is an adapter capability state, not a product scope decision.

## Alternatives considered

Calling the SDK from Vue components was rejected because it leaks provider types and lifecycle ownership into the view. Wrapping the SDK inside Pinia was rejected because it makes the store both fact source and UI projection. Moving the provider to Rust immediately was rejected because the required first provider is the confirmed web SDK and doing so would invent an unverified native protocol.

## Consequences

The frontend gains an explicit asynchronous lifecycle and must render disconnected, connecting, synchronizing, ready, and failed states. Contract and mapper tests become the primary protection against SDK changes. The adapter adds mapping code, but provider replacement is confined to one infrastructure boundary.

## Migration, rollback, and recovery

This replaces the unreleased fixture contract directly; no compatibility
aliases or persisted-data migration are provided. Browser development retains
the same visible sample workflow through `MockChannelTransport`, not store
fixtures. Rollback consists of selecting the mock transport at composition
time; it does not restore mock ownership to Pinia. Managed credential removal
is owned by Center logout and the Rust managed workspace service. Provider
state is reconstructed from SDK pages/events after the next successful login.

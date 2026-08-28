# Channel Agent History Tool Implementation Plan

**Goal:** Replace automatic history preload with an anchor-only prompt and a
bounded `load_channel_messages` host tool shared by Tea, Claude Code, and Codex.

**Architecture:** `ConversationToolBroker` carries typed definitions, calls,
and results across Tauri. `ConversationAgentTaskClient` owns the task-scoped
Channel executor; each `ConversationRuntime` maps the same contract to its
native structured tool protocol.

**Related decisions:** ADR 0009, ADR 0010, and
`docs/testing/channel-agent-history-tool.md`.

## Invariants

- Components do not execute tools or call Tauri/provider APIs.
- Runtime ids never control branches above `ConversationRuntime` adapters.
- IPC values are serializable, schema validated, bounded, and credential-free.
- One scope fixes account, Channel, and anchor outside model arguments.
- Only successful tool results add unique refs to task evidence.
- Human approval remains the only Channel write path.
- Unsupported runtimes fail closed without bulk preload.

## Phase 1: Channel history facts

1. Extend `LoadMessagesRequest` with provider-neutral before/after direction.
2. Add contract tests for anchor exclusion, stable chronological output,
   `hasMore`, next anchor, limits, and unknown cursors.
3. Make `MockChannelTransport` pass both directions.
4. Map Yunxin through `getMessageListEx`, keeping enums/raw messages private.
5. Verify pagination and projection tests.

Owning files:

- `src/features/channels/contracts.ts`
- `src/infrastructure/channels/contractTests.ts`
- `src/infrastructure/channels/MockChannelTransport.ts`
- `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- their focused tests

## Phase 2: Generic conversation host tools

1. Add bounded tool definition/request/result DTOs and `hostTools` capability in
   TypeScript and Rust.
2. Extend conversation creation, event subscription, and result resolution.
3. Implement `src-tauri/src/conversation/tool_broker.rs` with scope ownership,
   pending-call correlation, deadlines, duplicate suppression, cancellation,
   and teardown.
4. Test serialization, hostile JSON, unknown calls, out-of-order results,
   timeout, saturation, scope isolation, and dispose.

## Phase 3: Runtime adapters

1. In `../tea-rs`, add a product-neutral task-scoped custom-tool session API to
   `tea-coding`/Tea facade without mutating frozen live registries.
2. Consume it in `BuiltInTeaRuntime` and route its executor to the broker.
3. Add Codex `turn/start.dynamicTools`, parse `item/tool/call`, and return
   `DynamicToolCallResponse`.
4. Add a strict task-only Claude MCP bridge on random loopback with a short-lived
   capability token and `0600` config; allowlist only the generated tool.
5. Advertise `hostTools` only after each adapter proves its contract.

## Phase 4: Channel task use case

1. Add `channelHistoryTool.ts` with fixed schema, cursor allowlist, budgets,
   sanitization, and stable errors.
2. Subscribe to tool requests before sending the task prompt.
3. Replace fixed-window prompt construction with exactly one anchor message.
4. Remove `AGENT_CONTEXT_LIMIT` and the pre-run transport history query.
5. Merge successful returned refs into `AgentTask.contextMessageRefs`.
6. Project localized requested/running/completed/failed tool activity without
   exposing arguments, cursors, tokens, or provider diagnostics.

## Phase 5: Verification and rollout

Run the complete acceptance matrix for zero calls, before, after, bidirectional,
hostile cursor, duplicates, bounds, timeout, cancellation, disconnect/reconnect,
kicked-offline, account switch, refresh, dispose, unsupported capability, and
Draft send idempotency.

Required checks:

```bash
pnpm test:run
pnpm type-check
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --workspace --manifest-path ../tea-rs/Cargo.toml
cargo clippy --workspace --all-targets --manifest-path ../tea-rs/Cargo.toml -- -D warnings
git diff --check
```

Manually verify Tea, Claude Code, and Codex with one sufficient anchor and one
task that queries both directions. Do not commit or push without explicit user
instruction.

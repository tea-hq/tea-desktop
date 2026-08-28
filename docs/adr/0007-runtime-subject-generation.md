# ADR 0007: Runtime-Specific Conversation Subject Generation

## Context

The conversation catalog currently derives every title from the first line of the first user prompt. Claude Code and Codex can use their configured models to produce a concise semantic subject, but neither exposes one common stable auto-title protocol. Title generation must not add messages to the canonical conversation or make frontend memory authoritative.

## Decision

`ConversationRuntime` exposes an optional `Subject` capability and a detached `generate_subject` operation.

- Tea does not implement the capability and keeps the bounded first-message title.
- Claude Code uses a separate non-persistent structured print invocation.
- Codex uses the product-neutral Rust `codex-client` crate. Its Exec transport mirrors the official TypeScript SDK by spawning `codex exec --json` and requesting structured output from an ephemeral run.
- The Desktop conversation catalog remains the authoritative title store.
- The application service starts generation asynchronously after the first prompt is accepted.
- A catalog set-if-missing operation prevents generated results from overwriting a manual rename.
- Generated output equivalent to the source message is rejected.
- Generation failure leaves the catalog title empty so a later message can retry; it is never presented as a successful semantic title.

Generated titles and fallback titles use the existing `conversation:updated` event. Subject generation never mutates canonical conversation history.

## Alternatives

Using Codex for every runtime would provide one prompt and output style, but it would require Codex configuration for Claude conversations and send Claude prompts across provider boundaries.

Reading Claude or Codex private session files could recover some native titles, but those formats are not versioned runtime protocols and would introduce unsupported persistence coupling.

Generating inside the active conversation would avoid a second process, but it would pollute durable conversation context.

Using a temporary Codex app-server helper thread was implemented first. Real rollout evidence showed that the model produced the correct subject, while the subsequent `thread/read` projection failed and triggered the first-message fallback. The extra persisted thread and read-back race are unnecessary for one-shot metadata generation.

Depending on the third-party `codex-client-sdk` crate was rejected because it is not maintained in the OpenAI Codex repository and trails the installed CLI protocol. Depending directly on Codex's internal `codex-app-server-client` crate was also rejected because it embeds a large, unpublished internal workspace surface rather than a stable external SDK.

## Consequences

Each external runtime owns one small subject adapter and its failure semantics. Claude and Codex incur a detached process and model turn. Codex metadata runs do not create session files. Output style may vary by provider. The catalog and frontend keep one title contract, and users can always override generated titles without later replacement.

The initial Rust SDK scope is intentionally narrow: bounded process execution, JSONL event reduction, cancellation by timeout, and structured output. Persistent app-server threads, bidirectional approvals, snapshots, and reconnect semantics remain in the Desktop adapter until the SDK exposes a complete typed app-server transport.

## Migration And Rollback

No schema migration is required. Existing titles remain unchanged; only untitled external conversations receive generated subjects. Rollback removes the optional capability and restores the first-message path without changing persisted records.

## Recovery

Timeouts, malformed model output, unavailable CLIs, and process failures are non-fatal to the primary conversation. The title remains empty and generation can retry after a later accepted message. Failures are logged by the host and never replaced with the source sentence.

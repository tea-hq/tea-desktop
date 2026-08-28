# Channel Agent History Tool Acceptance Matrix

## Contract behavior

| Scenario                 | Expected result                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Anchor is sufficient     | Draft completes with zero history tool calls.                                               |
| Query before anchor      | Returned page excludes anchor, is chronological, and exposes bounded next cursor/`hasMore`. |
| Query after anchor       | Same invariants with ascending provider query direction.                                    |
| Bidirectional query      | Unique refs from both pages merge into one task evidence projection.                        |
| Unknown or unseen cursor | Stable non-retryable tool error; transport is not called.                                   |
| Other Channel/account    | Impossible in model schema and rejected by scope validation.                                |
| Duplicate request/result | Exactly one execution and one projected terminal activity.                                  |
| Unsupported runtime      | Runtime is absent from Channel task launcher; no preload fallback.                          |

## Bounds and hostile input

- Reject tool arguments over 4 KiB, depth over 4, extra properties, invalid
  direction, limit outside 1-10, and malformed refs.
- Stop after 6 calls, 40 unique messages, or 32,000 returned characters.
- Truncate individual message text to 4,000 characters and total result to
  48 KiB/depth 6.
- Treat every returned message as untrusted quoted source. Provider extensions,
  attachments, receipts, reactions, tokens, and SDK values are absent.

## Lifecycle and recovery

| Fault                         | Expected result                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tool timeout                  | Pending call fails once; runtime receives bounded error.                                                 |
| Runtime cancellation          | Tool query is cancelled and scope closes.                                                                |
| Disconnect/reconnect          | Retry only in same account/scope; otherwise fail closed.                                                 |
| Kicked offline/account switch | Pending calls and all scopes close before Channel projection clears.                                     |
| Runtime process exits         | Tool bridge and temporary resources are destroyed.                                                       |
| Application dispose           | Broker has no pending calls, scopes, listeners, or temporary secrets.                                    |
| Refresh/restart               | Pending task is not resumed, stale Claude MCP configs are removed, and regeneration creates a new scope. |

## Runtime adapters

- Tea: native task-scoped `ToolSpec` execution, progress, result, failure, and
  cancellation through `tea-rs`.
- Claude Code: strict MCP config, allowlist, authentication, cleanup, malformed
  request, timeout, and child exit.
- Codex: `dynamicTools`, `item/tool/call`, structured success/error response,
  duplicate calls, malformed arguments, and protocol capability failure.

All three must pass the same provider-neutral zero-call and one-call task suite.

## Draft and UI

- Tool activity is localized and compact; raw arguments, cursors, tokens, and
  provider diagnostics are never rendered.
- `AgentTask.contextMessageRefs` starts with the anchor and adds only successful,
  unique tool-result refs.
- Empty output, runtime failure, and cancellation never create a reviewable
  Draft.
- Human editing and approval remain unchanged; repeated approval sends exactly
  one Channel message and retains the provider message id.

## Required checks

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

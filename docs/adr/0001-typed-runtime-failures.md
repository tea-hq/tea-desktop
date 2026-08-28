# ADR-0001: Typed Runtime Failures

- Status: Accepted
- Date: 2026-08-20

## Context

The built-in Tea runtime previously discarded `CodingAgentService::wait()`
errors and projected every provider failure as `interrupted`. A provider HTTP
429 was therefore rendered as `Error: interrupted`. Parsing provider messages
in Vue or Desktop would duplicate SDK semantics and could expose unsafe payload
content.

## Decision

`tea-rs` owns one provider-neutral `CodingErrorCode` classification from model
adapter through the coding service. It distinguishes authentication,
permission, rate limiting, context overflow, availability, transport, invalid
request, cancellation, and internal failures. Safe technical diagnostics remain
separate from the classification.

Desktop maps that SDK code into a typed `ConversationFailure` containing a
stable code, an optional bounded safe diagnostic, and retryability. The Tea
runtime consumes the owned `wait()` result as the authoritative failure
terminal; it does not emit a generic `interrupted` terminal first. Vue renders
localized copy from the stable code and keeps the diagnostic in an expandable
detail.

External CLI adapters use the same terminal shape but retain an `externalCli`
classification because their protocol does not provide Tea model failure
semantics.

## Consequences

- Provider failures remain machine-readable through every layer.
- UI copy is localized without matching English diagnostics or HTTP strings.
- Safe diagnostics can aid debugging without exposing credentials or raw
  provider payloads.
- This replaces the previous WIP `RunFailed { code: String }` contract directly;
  no compatibility shim is retained.

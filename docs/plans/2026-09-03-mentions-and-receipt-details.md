# Mentions And Receipt Details

## Problem

Tea already projects unread counts and aggregate message receipts, but group
collaboration lacks two essential loops: intentionally notifying a teammate
and inspecting who has or has not read a sent message. The existing UIKit is
used only to verify Yunxin SDK calls and extension semantics. Tea owns the
desktop interaction model.

## Invariants

- Vue components emit provider-neutral mention metadata and never construct
  `yxAitMsg` or call a Yunxin service.
- Mention targets are either a user account or the current channel. Text ranges
  use JavaScript string offsets and are re-derived immediately before send.
- Yunxin encoding and decoding live in the Yunxin adapter. A future N-API
  adapter can translate the same contract without changing the store or UI.
- Receipt detail is authoritative provider data. Renderer state is an
  operation-scoped projection and is cleared when its dialog closes.
- User profile lookup may degrade to account IDs, but receipt membership and
  counts must not be discarded when profile enrichment fails.

## Flow

1. Typing `@` in a group composer requests group members through the channel
   store. A compact keyboard-accessible menu filters members locally.
2. Selecting a member inserts a token and records a provider-neutral target.
   Submit recomputes all live token ranges and sends them with the message.
3. The Yunxin adapter merges mention metadata into `serverExtension.yxAitMsg`
   and parses the same field on received messages.
4. A sent group message with receipt counts exposes a read-detail action. The
   request crosses client, preload IPC, main service, and transport boundaries.
5. The adapter calls `getTeamMessageReceiptDetail`, enriches returned account
   IDs in bounded batches, and returns stable `MessageReceiptDetails`.

## Failure And Recovery

- Invalid or stale mention ranges fail as `invalidRequest` and preserve a
  stable store error code for recovery.
- Receipt transport failure leaves the dialog open with a retry action.
- Profile enrichment failure falls back to account IDs and does not turn a
  successful receipt query into a failed operation.

## Verification

- Unit-test mention collection and Yunxin extension mapping.
- Cover Yunxin send/reply encoding and receipt-detail profile enrichment.
- Cover IPC/client delegation and store lifecycle behavior.
- Component-test keyboard mention selection and read/unread detail states.
- Run type check, unit tests, format, lint, UI boundary check, and web/runner
  builds; inspect English and Chinese layouts at desktop and 390 px widths.

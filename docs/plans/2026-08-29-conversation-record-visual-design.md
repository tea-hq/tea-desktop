# Conversation Record Visual Design

## Problem

The Agent conversation currently gives every tool call a bordered card. That
pushes execution activity above the actual conversation and makes long runs
harder to scan. The target is a flatter, document-like record inspired by the
provided reference while preserving Tea's message, approval, failure, and
streaming semantics.

## Decision

Use a hybrid conversation record:

- Keep each `ConversationTurn` as the boundary for one user prompt and its
  assistant response blocks.
- Render assistant text as the primary reading surface with generous rhythm and
  no enclosing bubble.
- Render tool calls as compact activity rows with an icon, tool name, status,
  and optional message. Arguments remain available behind an explicit,
  keyboard-accessible disclosure control.
- Keep approval controls attached to the tool activity that is waiting for a
  decision. Failures keep their error and retry/detail semantics.
- Show a lightweight turn status for sending, running, completed, failed, and
  cancelled states. The UI derives this from the existing turn status; it does
  not invent elapsed time or additional runtime facts.
- Use the existing neutral Tea tokens and both locale files. No new component
  library, protocol field, reducer state, or persistence field is introduced.

## Ownership And Recovery

`ConversationTurn.vue`, `ToolCallBlock.vue`, and `ConversationFailureTip.vue`
own presentation only. The conversation store and timeline reducer remain the
source of truth for block order, status, approval correlation, cancellation,
and terminal states. If an activity row cannot expand, the tool call remains
visible with its status; approval and failure actions remain available.

## Verification

Cover the activity disclosure and status affordances at the component or E2E
boundary, then run the standard type, test, format, lint, UI-boundary, and web
build checks. Verify English and Chinese text at the 390px fixture width.

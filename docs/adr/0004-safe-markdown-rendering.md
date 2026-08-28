# ADR-0004: Safe Markdown Rendering

- Status: Accepted
- Date: 2026-08-20

## Context

Agent responses commonly contain Markdown headings, lists, tables, links,
quotes, and fenced code. Rendering them as plain text loses useful structure.
Rendering arbitrary generated HTML directly would create an unsafe webview
boundary, while importing a complete Markdown editor would add unrelated state,
controls, and dependencies to a read-only conversation surface.

Streaming responses also update frequently. The renderer must tolerate
incomplete Markdown and avoid doing more than one DOM update per animation
frame without changing the canonical conversation state.

## Decision

Use `markdown-it` as the product-independent Markdown parser behind a shared
frontend renderer module. Configure it with raw HTML disabled and its built-in
URL validation enabled. Generated links open separately with
`noopener noreferrer`; remote images load lazily without a referrer.

Pass the generated HTML through DOMPurify before it reaches Vue `v-html`.
Forbid active form, frame, embedded-object, style, and event-bearing content.
The shared `MarkdownContent` component owns sanitization, semantic typography,
overflow behavior, and animation-frame batching for streaming updates.

Conversation components pass assistant text and streaming state into this
component. User prompts remain plain text. The canonical transcript remains the
typed conversation event projection; rendered HTML is derived, disposable UI
state and is never persisted.

Syntax highlighting, code-copy actions, diagrams, mathematics, and internal
resource navigation are not part of this decision. They may be added as typed
extensions inside the shared Markdown boundary when a concrete workflow needs
them.

## Alternatives

- `marked` was viable and actively maintained, but offered no material benefit
  over `markdown-it` for the required CommonMark extensions and renderer hooks.
- `streamdown` targets streaming AI content but requires React and React DOM.
- `md-editor-v3` includes an editor and CodeMirror stack that the read-only
  conversation surface does not need.
- Vue Markdown wrappers were rejected because the current requirement needs a
  small stable boundary, not another component abstraction over the parser.

## Consequences

- Agent text consistently renders common Markdown structures across runtimes.
- Raw HTML and dangerous URL protocols remain inert, with DOMPurify providing a
  second defense if future parser extensions change output.
- Large streaming blocks are still reparsed from their canonical source, but UI
  updates are bounded to the display frame rate.
- New rich-content features have one explicit extension point and must preserve
  the sanitizer and overflow invariants.

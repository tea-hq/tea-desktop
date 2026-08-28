# Tea Desktop Engineering Guide

`CLAUDE.md` symlinks here. Edit `AGENTS.md` only, read every applicable file,
and keep each below 8 KiB. Put public invariants in the narrowest file; keep
private material out of the repository.

## Project

Tea Desktop is an Electron + Vue 3 + TypeScript app. Electron main hosts
platform services and process lifecycle; the renderer is a product UI over
typed feature ports. External agents use the unified runtime boundary and
official ACP in phase two.

This target is the Electron implementation. Do not reintroduce the old
Tauri/Rust host, `node-nim`, direct Node APIs in the renderer, or compatibility
branches for unreleased experiments.

## Compatibility

`1.0` is the compatibility boundary. Before then, replace incorrect
experimental interfaces and schemas directly; do not add aliases, forward
readers, duplicate fields, fallback state machines, or WIP migration code.
Before a public contract or persisted format stabilizes, document versioning,
migration, deprecation, rollback, and recovery.

## Ownership And Dependency Direction

Before adding a capability, identify its owner, stable port, source of truth,
error semantics, cancellation, recovery, and tests. Do not duplicate runtime
or approval state machines in the UI.

```text
Vue views/components
  -> feature store / use case
  -> typed client port
  -> context-isolated preload IPC
  -> Electron main application service
  -> ConversationRuntime registry
     -> ExternalCliRuntime
     -> AcpConversationRuntime (phase two)
```

- Vue components render state and emit intent. They never call Electron IPC,
  orchestrate Agents, parse protocols, retry, persist, or own approvals.
- Stores/use cases own async flows and UI projections; reducers only compute
  state. Keep ephemeral UI state separate from durable conversation facts.
- Preload exposes only typed methods and allowlisted events. Never expose raw
  `ipcRenderer`, shell access, Node handles, ACP messages, or credentials.
- Main handlers validate input, delegate, and return stable typed error codes.
  They do not contain renderer business rules.
- Runtimes declare capabilities and authoritative facts, support cancellation,
  failure, and shutdown, and register in the runtime registry. Components and
  commands must not branch on runtime names.
- Durable session truth comes from runtime catalogs, snapshots, and events.
  Renderer state is a replayable projection, not another fact store.

## App Entry And Components

`src/App.vue` only imports and renders the app root. It does not own stores,
watchers, lifecycle orchestration, page templates, IPC, protocol parsing, or
feature business rules.

- `src/app/useTeaDesktopApp.ts` is the Composition Root: configure clients,
  coordinate workspace lifecycle, and expose typed app actions.
- `TeaDesktopRoot.vue` owns the signed-out/signed-in branch. `WorkspaceShell.vue`
  owns the rail, shell layout, and global overlays. `WorkspaceContent.vue` owns
  page selection only.
- `ChannelWorkspace.vue` and `AgentWorkspace.vue` compose feature components;
  they do not implement runtime, transport, persistence, or reducer logic.
- Feature components own one visual responsibility and use typed props/events.
  Feature stores/use cases own asynchronous workflows.
- Cross-feature actions belong in an app/use-case module with a named action,
  not in template expressions or duplicated callbacks. Prefer a narrow model or
  context per workflow over a generic `any` object or a god component.
- Add components only for independent state/interaction boundaries or reuse;
  do not split markup into meaningless wrappers.

## Runtime And Process Rules

`ConversationRuntime` is the renderer-neutral port for external agents.
External CLI runtimes use explicit executable paths and typed arguments. Never
use shell interpolation or infer session facts from terminal text. Preserve
runtime ids, event sequences, terminal state, approval correlation, and
recovery behavior.

Phase two ACP code belongs in Electron main and uses the official
`@agentclientprotocol/sdk` TypeScript Client and supported transports. Use
standard ACP protocol/versioning. Do not create a private JSON bridge, parse
vendors in the renderer, or add ACP under Rust/Tauri. ACP must fit the existing
registry and ConversationClient contracts.

## Security And Durable State

- No credentials in source, renderer storage, argv, logs, persisted catalog
  rows, or plugin action payloads. Electron main resolves credentials through
  the platform credential service.
- Plugin actions use explicit plugin, connection, action, and version refs.
  Main validates them and owns process startup, framed transport, timeout,
  shutdown, and recovery.
- Plugin frames are bounded: 4-byte big-endian length prefix, 256 KiB maximum.
  Changes require a versioned contract and tests.
- Durable catalog writes complete locally before any optional sync/upload
  result is reported. A failed sync must not roll back a successful local
  write or claim that the durable write failed.
- Agent Roles store configuration, not secrets. Roles bind explicitly to
  runtime/config and never fall back when the machine, config, model, mode, or
  capability is unavailable. Permission mode is run config, not auto-approval.
- MCP selections, when enabled, belong to the driving turn input. Preserve an
  explicit empty selection and do not reconstruct it from session history.
- Fixtures are synthetic. Never commit captured user or Agent transcripts.

## Workflow And Testing

For non-trivial changes, state the problem, invariant, owner, affected
contracts, and failure/recovery behavior. Update types and state transitions
first, then implement outward: runtime/service -> main -> preload -> client ->
store -> component. Add owner/boundary tests, run relevant checks, and record
significant decisions in `docs/adr/`.

Tests must be deterministic: no real sleeps, wall-clock races, networks,
machine-load assumptions, or scheduler luck. At the lowest realistic boundary,
cover invalid input, duplicate/out-of-order events, cancellation, terminal
states, recovery, and stable error codes.

Default checks:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
```

AI-agent packaging checks must not sign or notarize artifacts. Disable signing
identity discovery as shown above, do not provide signing or notarization
credentials, and do not invoke `codesign` or `notarytool`. Sign or notarize only
when the user explicitly requests a release operation.

## Internationalization

Put user-facing copy in `src/locales/en.ts` and `src/locales/zh-CN.ts`.
Components use `vue-i18n` keys; stores/reducers store message keys and never
call `useI18n()`. Add every key to both locales. Keep runtime names, model ids,
file names, and diagnostics unchanged unless a localized label exists.

## UI Rules

Tea uses Vue 3, Tailwind CSS, and MDI icons. Shared UI primitives use semantic
HTML and own keyboard/focus behavior for reusable controls and overlays. Do not
add a component library or headless layer. Visual tokens belong to shared UI;
Tailwind utilities provide layout, appearance, sizing, positioning, overflow,
and responsive structure. Feature code must use semantic tokens instead of raw
palette colors, arbitrary radii, or one-off shadows.

Keep the OpenSession visual discipline: use the shared surface hierarchy and
Tailwind hover washes, keep sections and repeated rows borderless unless a
hairline is the actual divider, and scale corners consistently (structural 8px,
controls 12px, overlays 16px). Reserve elevation for overlays. Avoid gradients,
decorative blobs, glassmorphism, nested cards, and card-heavy views. Icon-only
actions need accessible names and, when unclear, tooltips. Verify loading,
empty, stale, error, approval, streaming, focus, disabled, reduced-motion, and
390px narrow states. English and Chinese text must wrap without overlap.

## Commits

Use Conventional Commits with an English imperative subject no longer than 72
characters. Use `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, or
`chore`. Do not bypass hooks or mix unrelated changes. Do not commit or push
without explicit user instruction. AI-authored commits end with
`Model: <runtime-model-id>`.

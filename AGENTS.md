# Tea Desktop Engineering Guide

`CLAUDE.md` symlinks to this file. Edit `AGENTS.md` only. Read every applicable
`AGENTS.md`. Keep each file below 8 KiB. Public invariants belong in the
narrowest file; private material stays out of the repository.

## Project

Tea Desktop is an Electron + Vue 3 + TypeScript application. Electron main
hosts platform services and process lifecycle. The renderer is a product UI
over typed feature ports. External agents use the unified runtime boundary and
official ACP in phase two.

This target is the Electron implementation. Do not reintroduce the old
Tauri/Rust host, `node-nim`, direct Node APIs in the renderer, or compatibility
branches for unreleased experiments.

## Compatibility

The first `1.0` release is the compatibility boundary. Before `1.0`, replace
incorrect experimental interfaces and initial schemas directly instead of
adding aliases, forward readers, duplicate fields, fallback state machines, or
WIP-only migration code. Before a public contract or persisted format becomes
stable, document versioning, migration, deprecation, rollback, and recovery.

## Ownership And Dependency Direction

Before adding a capability, identify its owning layer, stable port, source of
truth, error semantics, cancellation, recovery, and tests. Do not duplicate a
runtime or approval state machine in the UI.

```text
Vue views/components
  -> feature store / use case
  -> typed client port
  -> context-isolated preload IPC
  -> Electron main application service
  -> ConversationRuntime registry
     -> BuiltInTeaRuntime
     -> ExternalCliRuntime
     -> AcpConversationRuntime (phase two)
```

- Vue components render state and emit intent. They do not call Electron IPC,
  orchestrate Agents, parse protocols, retry, persist, or own approvals.
- Stores and use cases own async flows and UI projections. Pure reducers only
  compute state. Ephemeral selection, panels, drafts, and scroll positions are
  separate from durable conversation facts.
- Preload exposes typed methods and allowlisted events only. Never expose raw
  `ipcRenderer`, shell access, Node handles, ACP messages, or credentials.
- Main handlers validate input, delegate to services, and return stable typed
  error codes. They do not contain renderer business rules.
- A runtime declares its capabilities and authoritative facts, supports
  cancellation/failure/shutdown, and is registered in the runtime registry.
  Components and commands must not branch on runtime names.
- Durable session truth comes from the runtime catalog/snapshots/events.
  Renderer state is a replayable projection, not a second fact store.

## App Entry And Components

`src/App.vue` only imports and renders the app root. It must not own stores,
watchers, lifecycle orchestration, page templates, IPC calls, protocol parsing,
or feature business rules.

- `src/app/useTeaDesktopApp.ts` is the Composition Root: configure clients,
  coordinate workspace lifecycle, and expose typed app actions.
- `TeaDesktopRoot.vue` owns the signed-out/signed-in branch. `WorkspaceShell.vue`
  owns the rail, shell layout, and global overlays. `WorkspaceContent.vue` owns
  page selection only.
- `ChannelWorkspace.vue` and `AgentWorkspace.vue` compose feature components;
  they do not implement runtime, transport, persistence, or reducer logic.
- Feature components own one visual responsibility and communicate with typed
  props and events. Feature stores/use cases own asynchronous workflows.
- Cross-feature actions belong in an app/use-case module with a named action,
  not in template expressions or duplicated callbacks. Prefer a narrow model or
  context per workflow over a generic `any` object or a god component.
- Add components only for independent state/interaction boundaries or reuse;
  do not split markup into meaningless wrappers.

## Runtime And Process Rules

`ConversationRuntime` is the only renderer-neutral port for built-in and
external agents. External CLI runtimes use explicit executable paths and typed
arguments. Do not use shell interpolation or infer session facts from terminal
text. Preserve runtime ids, event sequences, terminal state, approval
correlation, and recovery behavior.

Phase two ACP code belongs in Electron main and uses the official
`@agentclientprotocol/sdk` TypeScript Client and supported Agent transports.
Use the standard ACP protocol and versioning. Do not create a private JSON
bridge, put vendor parsing in the renderer, or add ACP under Rust/Tauri. ACP
must fit the existing registry and ConversationClient contracts.

## Security And Durable State

- No credentials in source, renderer storage, argv, logs, persisted catalog
  rows, or plugin action payloads. Electron main resolves credentials through
  the platform credential service.
- Plugin action execution uses explicit plugin identity, connection, action,
  and version references. The main process validates all references and owns
  plugin process startup, framed transport, timeout, shutdown, and recovery.
- Plugin protocol frames are bounded. The current protocol uses a 4-byte
  big-endian length prefix and a 256 KiB maximum frame; changes require a
  versioned contract and tests.
- Durable catalog writes complete locally before any optional sync/upload
  result is reported. A failed sync must not roll back a successful local
  write or claim that the durable write failed.
- Agent Roles store configuration, not secrets. Roles bind explicitly to their
  runtime/config and never silently fall back when the machine, config, model,
  mode, or capability is unavailable. Permission mode is part of run config,
  not an auto-approval policy.
- MCP selections, when enabled, belong to the driving turn input. Preserve an
  explicit empty selection and do not reconstruct it from session history.
- Fixtures are synthetic. Never commit captured user or Agent transcripts.

## Workflow And Testing

For non-trivial changes, state the problem, invariant, ownership, affected
contracts, and failure/recovery behavior. Update types and state transitions
first, then implement outward: runtime/service -> main -> preload -> client
port -> store -> component. Add owning-layer and boundary tests, run all
relevant checks, and record significant decisions in `docs/adr/`.

Tests must be deterministic: no real sleeps, wall-clock races, network
dependencies, machine-load assumptions, or scheduler luck. Cover invalid input,
duplicate/out-of-order events, cancellation, terminal states, recovery, and
stable error codes at the lowest realistic boundary.

Default checks:

```sh
npm run type-check
npm run test:run
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

All user-facing copy belongs in `src/locales/en.ts` and
`src/locales/zh-CN.ts`. Components use `vue-i18n` keys; stores and reducers
store message keys and do not call `useI18n()`. Add every key to both locale
files. Keep runtime names, model ids, file names, and technical diagnostics
unchanged unless a dedicated localized label exists.

## UI Rules

Tea uses Vue 3, PrimeVue 4 Styled Mode, Tailwind for layout, and MDI icons.
Product code imports PrimeVue through `src/shared/ui/` primitives. Do not add
another component library or headless layer. Theme/design tokens belong to
shared UI; Tailwind is for layout, sizing, positioning, overflow, and
responsive structure, not component appearance or state styling.

Keep structural regions nearly square and reserve shadows for overlays. Avoid
gradients, decorative blobs, glassmorphism, nested cards, and card-heavy
dashboards. Icon-only actions need accessible names and tooltips when unclear.
Verify loading, empty, stale, error, approval, streaming, focus, disabled, and
reduced-motion states. English and Chinese text must wrap without overlap.

## Commits

Use Conventional Commits with an English imperative subject no longer than 72
characters. Use `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, or
`chore`. Do not bypass hooks or mix unrelated changes. Do not commit or push
without explicit user instruction. AI-authored commits end with
`Model: <runtime-model-id>`.

# Tea

Tea is an Electron desktop application for working with external Agent
runtimes through one conversation workspace.

The current migration phase moves the Tea Desktop product surface into this
Electron repository. The next phase will add official ACP support behind the
runtime boundary.

## Features

- Conversation workspace with streaming responses, history, snapshots,
  cancellation, approvals, and recovery.
- Yunxin channels with channel history, direct conversations, collaboration,
  drafts, and message delivery.
- External Claude Code CLI and Codex app-server runtimes.
- Agent Roles, managed workspace state, directory, settings, skills, plugins,
  and credential management.
- Context-isolated Electron preload with typed and allowlisted IPC.

## Quick Start

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

The development server uses `127.0.0.1:1420`. To use another port for an
isolated local run, pass a Vite port override directly:

```sh
npx vite --port 1421
```

## Commands

```sh
npm run type-check
npm run test:run
npm run lint
npm run build:web
npm run build
```

`npm run build` creates the platform package through Electron Builder. Build
output in `dist`, `dist-electron`, and `release` is generated and ignored by
Git.

## Architecture

Electron main owns operating-system access, local persistence, credentials,
channel services, runtime processes, and recovery. The preload exposes only
typed commands and allowlisted events. The renderer contains feature stores,
reducers, use cases, and Vue components; it never imports Electron APIs,
Node process handles, filesystem APIs, or credentials.

The runtime boundary is renderer-neutral:

```text
Vue components
  -> feature store / use case
  -> typed ConversationClient
  -> context-isolated preload IPC
  -> Electron main service
  -> ConversationRuntime registry
     -> external Claude/Codex runtime
     -> official ACP runtime (phase two)
```

## ACP Roadmap

ACP is intentionally not part of the first migration phase. In phase two,
external agents will connect through the official ACP TypeScript SDK in
Electron main and the standard ACP protocol. ACP types, protocol framing, and
vendor event parsing stay out of the renderer. The existing runtime port and
renderer DTOs remain the integration boundary so adding ACP does not require a
second UI state machine or a private bridge protocol.

## Project Structure

- `electron/` — Electron main, preload, persistence, channel, runtime, plugin,
  credential, and workspace services.
- `src/app/` — application composition and root lifecycle.
- `src/features/<feature>/` — feature stores, use cases, reducers, components,
  contracts, and tests.
- `src/infrastructure/` — renderer-side typed adapters for Electron services.
- `src/shared/ui/` — reusable Tea UI primitives.
- `src/types/` — cross-feature contracts and IPC DTOs.
- `docs/` — architecture decisions and implementation plans.
- `tests/` — cross-feature and acceptance-oriented tests.

## Security Boundaries

- Renderer-to-main calls use a fixed command and event allowlist.
- Secrets are stored and resolved by Electron main; they are not accepted from
  renderer action payloads, command arguments, logs, or catalog records.
- Child processes use explicit executable paths and typed arguments, never
  shell interpolation.
- Plugin processes use the versioned framed protocol implemented by the main
  process; invalid identities, actions, versions, and responses fail clearly.
- Fixtures must be synthetic. Do not commit user or Agent transcripts.

## Contributing

Read [`AGENTS.md`](./AGENTS.md) before making changes. Keep ownership in the
correct layer, update typed contracts before wiring UI, add tests at the owning
boundary, and run the relevant checks before handoff.

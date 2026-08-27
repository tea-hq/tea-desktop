# Electron First-Phase Migration Plan

> **For implementers:** REQUIRED SUB-SKILL: Use the repository's implementation
> workflow to implement this plan task-by-task. Phase one migrates the current
> Tea Desktop product into this Electron repository; phase two adds ACP.

**Goal:** Move the current Tea Desktop product surface and its existing desktop
capabilities from `tea-desktop` into the Electron-based `tea` repository without
introducing ACP during the migration phase.

**Architecture:** Electron main owns platform services, persistence, process
lifecycle, and typed IPC. The renderer keeps the existing Tea feature stores,
reducers, Vue components, and product contracts, but accesses platform services
only through a context-isolated preload API. Phase one preserves the existing
built-in Tea runtime boundary and channel/management behavior; phase two adds
the official ACP Client and Agent connections behind the same runtime port.

**Tech Stack:** Electron, Electron Builder, Vue 3, TypeScript, Pinia, PrimeVue,
Tailwind CSS, Vue I18n, Yunxin Web SDK, Vitest, and Playwright.

---

## Phase Boundary

Phase one is complete only when the migrated application supports the current
Tea Desktop workflows: authentication and offline profile state, Yunxin
channels, channel history and message sending, Agent conversation catalog,
streaming runtime events, approvals, cancellation, snapshots/history, channel
collaboration, drafts and delivery, directory, Agent Roles, settings, managed
workspace state, plugins, skills, and credential management.

The renderer must not import Tauri APIs, `node-nim`, raw Electron APIs, or ACP
types. The Electron main process must expose only validated typed commands and
allowlisted events through preload. ACP is not implemented in phase one, but
the runtime port and registry must remain able to accept the phase-two ACP
runtime without changing Vue components.

## Migration Order

1. Replace the demo renderer with the current Tea Desktop renderer and its
   local assets, tests, locales, contracts, stores, reducers, and UI system.
2. Replace the insecure Electron template defaults with a context-isolated
   preload bridge and a typed command/event contract.
3. Rename the renderer infrastructure adapters from Tauri to Electron and
   preserve their existing domain interfaces.
4. Port service ownership to Electron main: settings, catalog/recovery,
   credentials, plugins, skills, Agent Roles, center auth, managed workspace,
   and channel transport.
5. Port the existing built-in Tea runtime and external legacy runtime behavior
   behind the renderer-neutral `ConversationRuntime` boundary. Do not add ACP
   during this phase.
6. Remove the target demo's direct `node-nim` calls and obsolete Ant Design
   screens after the migrated workflows are covered.
7. Add the official ACP SDK and Agents only in phase two, using the runtime
   boundary established here.

## Non-Negotiable Invariants

- No renderer access to `ipcRenderer`, `child_process`, filesystem APIs,
  credentials, or arbitrary IPC channels.
- No Tauri `invoke`, Tauri events, or Rust-specific DTOs in migrated renderer
  infrastructure.
- No hardcoded Yunxin or center credentials in source, renderer storage, argv,
  logs, or persisted catalog records.
- Main-process commands validate input, enforce scope, and return stable typed
  errors. They do not return backend exception strings as product state.
- One authoritative owner exists for each durable fact. Renderer state is a
  replayable projection; Electron main owns local persistence and runtime
  bindings.
- ACP is a phase-two implementation detail behind the runtime port, not a
  private bridge or a reason to change renderer DTOs.

## Verification Gate

Run in the target repository after each migration slice:

```bash
npm run type-check
npm run test:run
npm run build:web
npm run build
```

The final phase-one gate also covers cold restart and persistence recovery,
authentication cancellation and logout, channel reconnect and event ordering,
conversation event ordering and cancellation, approval correlation, plugin
credential containment, IPC allowlisting, and packaged Electron startup.

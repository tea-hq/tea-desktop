# Electron Command Routing Implementation Plan

> **For Codex:** Execute this plan locally with the repository's normal
> verification workflow. Do not commit until the user explicitly requests it.

**Goal:** Remove the monolithic command switch from `electron/main.ts` while
preserving every IPC command, validation rule, service call, and stable error.

**Architecture:** Introduce a typed function-handler registry under
`electron/ipc/`. Group handlers by owning domain and compose them into one
startup-validated router. Keep `electron/main.ts` as the Electron composition
root and lifecycle owner.

**Tech Stack:** Electron, TypeScript, Vitest, Vue shared IPC contracts

---

### Task 1: Specify router invariants

**Files:**

- Create: `electron/ipc/commandRouter.test.ts`
- Create: `electron/ipc/commandRouter.ts`

**Steps:**

1. Test rejection of unsupported command names with `unsupportedCommand`.
2. Test rejection of non-record argument envelopes with `invalidRequest`.
3. Test normalization of omitted arguments to an empty record.
4. Test startup rejection for missing and duplicate handlers.
5. Implement the minimal router and run the focused test.

### Task 2: Extract domain handler groups

**Files:**

- Create: `electron/ipc/commandValidation.ts`
- Create: `electron/ipc/workspaceCommands.ts`
- Create: `electron/ipc/conversationCommands.ts`
- Create: `electron/ipc/catalogCommands.ts`
- Create: `electron/ipc/channelCommands.ts`
- Create: `electron/ipc/desktopCommandRouter.ts`
- Create: `electron/ipc/desktopCommandRouter.test.ts`

**Steps:**

1. Move shared record, string, integer, permission, and approval validation into
   the IPC boundary module without changing error codes.
2. Move commands into four handler maps based on service ownership.
3. Preserve auth-to-managed-workspace refresh recovery and plugin disable
   ordering.
4. Test that the production handler groups cover every `DesktopCommand` exactly
   once.
5. Test representative cross-service orchestration and validation failures.
6. Run `npm run test:run -- electron/ipc` and `npm run type-check`.

### Task 3: Reduce the Electron composition root

**Files:**

- Modify: `electron/main.ts`

**Steps:**

1. Replace service globals with one initialized service container retained only
   for shutdown.
2. Pass the initialized services to `createDesktopCommandRouter`.
3. Register the returned handler on the existing `tea:command` endpoint.
4. Leave window creation, application activation, initialization, and shutdown
   in `electron/main.ts`.
5. Verify that `electron/main.ts` contains no command switch or command-specific
   parsing.

### Task 4: Verify the boundary

**Steps:**

1. Run `npm run format:check`.
2. Run `npm run type-check`.
3. Run `npm run test:run`.
4. Run `npm run lint`.
5. Run `node scripts/check-ui-boundaries.mjs`.
6. Run `npm run build:web`.
7. Run `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build`.
8. Confirm only `.codegraph/` and the intended source/docs changes remain.

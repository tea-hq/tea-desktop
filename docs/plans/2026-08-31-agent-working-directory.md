# Agent Working Directory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let new Agent conversations optionally select an absolute working directory, pass it to ACP, persist it for recovery, and group conversations by project in the sidebar.

**Architecture:** Keep the desktop workspace identity separate from the user-selected working directory. The renderer sends an optional `workingDirectory` through the typed conversation client and IPC; the main service validates and persists it, while the ACP runtime resolves the actual cwd for process launch and `session/new`/restore requests. The sidebar treats unset directories as recent conversations and uses the complete path as an internal project key while displaying its final folder name.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron IPC, SQLite catalog, official ACP SDK, Vitest.

---

### Task 1: Persist the optional directory

Modify `src/features/conversation/contracts.ts`, `electron/storage/migrations.ts`, and `electron/conversation/catalog.ts`. Add `workingDirectory?: string` to summaries and migrate catalog schema version 1 to version 2 with a nullable `working_directory` column. Validate absolute paths and round-trip the value in insert/select/decode.

### Task 2: Thread cwd through service and ACP

Modify `electron/ipc/conversationCommands.ts`, `electron/conversation/commandService.ts`, `electron/conversation/service.ts`, `electron/conversation/runtime.ts`, `electron/conversation/acp/runtime.ts`, and the ACP tests. Validate the optional directory at the service boundary, include it in idempotency comparisons, resolve it to the runtime's default when absent, and use it for ACP process launch, actor construction, session creation, and persisted bindings. Restore from the binding's recorded path.

### Task 3: Expose the selection in the typed renderer flow

Modify `src/infrastructure/conversation/electronConversationClient.ts`, `src/features/conversation/store.ts`, `src/app/desktopAppState.ts`, `src/app/useWorkspaceActions.ts`, `src/app/components/AgentWorkspace.vue`, `src/features/conversation/components/AgentConversationSurface.vue`, and `src/features/conversation/components/AgentConversationComposer.vue`. Keep the directory in new-conversation state, clear it on a new session, pass it when creating, and render an accessible centered composer control with a clear action.

### Task 4: Redesign sidebar grouping and copy

Modify `src/features/conversation/components/ConversationSidebar.vue` and both locale files. Render a flat “Recent conversations” group for unset directories, then a “Projects” group with project basename headers and title/preview rows for configured directories. Keep complete paths as keys to avoid collisions.

### Task 5: Verify and commit

Add focused catalog, service, runtime, store, and component checks where existing test helpers permit. Run type-check, tests, formatting, lint, UI boundary checks, and web build with the bundled Node runtime, then commit with a Conventional Commit subject ending in the required model trailer.

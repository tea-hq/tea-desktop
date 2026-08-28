# Center Authentication P0 Hardening Implementation Plan

> **For Codex:** Execute this plan task-by-task with owning-layer tests before wiring outward.

**Goal:** Make Center authentication safe to cancel and retry, isolate every
tenant workspace across logout and account changes, define bounded offline and
revoked-session behavior, and verify the complete desktop flow before wider
client integration.

**Architecture:** Tauri owns one cancellable browser-login task and emits the
authoritative `CenterAuthState`. The auth feature store projects that state and
guards asynchronous results by operation generation. `App.vue` owns one
serialized workspace lifecycle which creates fresh tenant-scoped transports on
entry and destroys every tenant projection on exit. Refresh credentials remain
in the OS credential store; the SQLite cache contains only non-secret bootstrap
metadata for explicit offline-cached mode.

**Tech Stack:** Rust, Tokio, Axum, Tauri 2, Vue 3, Pinia, TypeScript, Vitest,
Go, PostgreSQL, fake OIDC HTTP fixtures, macOS Keychain.

---

### Task 1: Own And Cancel Browser Login In The Host

**Files:**

- Create: `src-tauri/src/center_auth/login_task.rs`
- Modify: `src-tauri/src/center_auth/commands.rs`
- Modify: `src-tauri/src/center_auth/mod.rs`
- Modify: `src-tauri/src/center_auth/service.rs`
- Modify: `src-tauri/src/center_auth/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/center_auth/login_task.rs`
- Test: `src-tauri/src/center_auth/service.rs`

1. Add a host-managed coordinator which owns at most one loopback listener and
   cancellation handle.
2. Cancel and retire the previous task before starting a new transaction.
3. Add `cancel_center_login` and make logout cancel the current task before
   clearing credentials and cache.
4. Ensure cancel, timeout, invalid callback, browser-open failure, and stale
   completion produce one retryable terminal state without clobbering a newer
   login.
5. Cover replacement, cancellation, stale completion, and terminal cleanup in
   Rust tests.

### Task 2: Make Frontend Login Cancellation Race Safe

**Files:**

- Modify: `src/features/auth/contracts.ts`
- Modify: `src/features/auth/store.ts`
- Modify: `src/infrastructure/auth/tauriCenterAuthClient.ts`
- Modify: `src/features/auth/components/EnterpriseLogin.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Test: `src/features/auth/store.test.ts`
- Test: `src/features/auth/components/EnterpriseLogin.test.ts`

1. Add a typed cancel operation to the Center auth client.
2. Guard initialize, login, cancel, logout, and pushed state by an operation
   generation so stale promises cannot overwrite the current projection.
3. Keep duplicate submit idempotent and return cancel/timeout to an editable,
   retryable login form.
4. Add localized cancel, retry, and recovery actions using compact icon
   controls consistent with the existing login surface.
5. Test cancel, duplicate submit, stale completion, retry, and recovery UI.

### Task 3: Isolate Tenant Workspace Lifecycles

**Files:**

- Create: `src/app/workspaceLifecycle.ts`
- Modify: `src/App.vue`
- Modify: `src/features/channels/store.ts`
- Modify: `src/features/collaboration/store.ts`
- Modify: `src/features/conversation/store.ts`
- Test: `src/app/workspaceLifecycle.test.ts`
- Test: `src/features/channels/store.test.ts`
- Test: `src/features/collaboration/store.test.ts`
- Test: `src/features/conversation/store.test.ts`

1. Serialize workspace start and stop around authenticated/offline-cached auth
   transitions.
2. Create a fresh channel environment for every workspace entry and never
   reuse a disposed IM transport.
3. On exit, cancel active work and clear channel, collaboration, conversation,
   managed-config, selection, and loading/error projections.
4. Guard initialization completion by workspace generation so a late previous
   tenant load cannot repopulate current state.
5. Test logout during initialization and tenant A -> signed out -> tenant B.

### Task 4: Close Offline, Revocation, And Secret Boundaries

**Files:**

- Modify: `src-tauri/src/center_auth/service.rs`
- Modify: `src-tauri/src/center_auth/cache.rs`
- Modify: `docs/testing/center-auth-and-offline.md`
- Test: `src-tauri/src/center_auth/service.rs`
- Test: `src-tauri/src/center_auth/cache.rs`

1. Cover unavailable Center with and without cache, revoked refresh, invalid
   bootstrap schema/domain, and logout with an unavailable revoke endpoint.
2. Verify revoked or protocol-invalid sessions clear refresh credentials and
   cached bootstrap, then require recovery.
3. Assert serialized auth state, SQLite rows, emitted events, and diagnostic
   formatting never contain access tokens, refresh credentials, IM tokens,
   provider API keys, OIDC secrets, or handoff verifiers.
4. Document exactly what offline-cached mode permits and does not prove.

### Task 5: Exercise The Fake OIDC End To End

**Files:**

- Modify: `../tea-center/internal/httpapi/desktop_oidc_test.go`
- Modify: `../tea-center/internal/session/*_test.go`
- Add or modify: Desktop Center-auth integration tests under
  `src-tauri/src/center_auth/`

1. Run discover -> desktop start -> fake OIDC callback -> loopback handoff ->
   exchange -> bootstrap with deterministic local fixtures.
2. Verify restart refresh, Center-unavailable cached entry, revoked refresh,
   invalid callback, duplicate callback, and logout/re-login isolation.
3. Assert browser and IPC-visible payloads exclude server and endpoint secrets.

### Task 6: Verify Release-Shaped Behavior

**Files:**

- Modify: `docs/adr/0014-center-endpoint-bootstrap.md`
- Modify: `docs/adr/0015-loopback-oidc-callback.md`
- Modify: `docs/testing/center-auth-and-offline.md`

1. Run all Desktop frontend tests, type-check, build, Rust check, and Rust
   tests.
2. Run Center tests with race detection and vet, then Center frontend tests,
   type-check, and build.
3. Build a debug packaged macOS application and smoke-test loopback bind,
   browser callback, Keychain persistence across restart, logout cleanup, and
   absence of secrets in the safe cache and logs.
4. Keep local indexing and temporary build artifacts untracked.

No commits are created until the user explicitly requests them.

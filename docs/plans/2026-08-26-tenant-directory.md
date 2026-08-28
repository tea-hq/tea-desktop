# Tenant Directory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the authenticated tenant's active users in tea-desktop with Center identity, OIDC profile, tenant scope, and safe IM account status sufficient to choose a recipient.

**Architecture:** tea-center owns the authoritative tenant-member query and exposes a versioned authenticated endpoint. tea-desktop's Tauri host calls that endpoint with the existing access token, while a Pinia store owns loading, stale/offline, and error state. The UI renders a searchable directory and keeps IM secrets out of the DTO; only provider/account/status metadata is returned.

**Tech Stack:** Go, PostgreSQL, Gin, Rust/Tauri 2, Vue 3, TypeScript, Pinia, Vitest.

---

### Task 1: Define the directory protocol and backend data port

**Files:**

- Create: `/Users/jj.deng/Documents/open-source/tea-center/internal/protocol/v1/endpoint_directory.go`
- Modify: `/Users/jj.deng/Documents/open-source/tea-center/internal/identity/identity.go`
- Modify: `/Users/jj.deng/Documents/open-source/tea-center/internal/identity/directory.go`

Add bounded request/query types, a `TenantUserDirectory` interface, and a Postgres implementation returning only active memberships. Include tenant summary, Center user ID, OIDC subject/username/profile, and per-provider IM account metadata. Never return IM token, app key, app secret, or encrypted-secret references.

### Task 2: Add the authenticated Center route

**Files:**

- Create: `/Users/jj.deng/Documents/open-source/tea-center/internal/httpapi/endpoint_directory.go`
- Modify: `/Users/jj.deng/Documents/open-source/tea-center/internal/httpapi/router.go`
- Modify: `/Users/jj.deng/Documents/open-source/tea-center/internal/app/app.go`
- Test: `/Users/jj.deng/Documents/open-source/tea-center/internal/httpapi/endpoint_directory_test.go`

Expose `GET /v1/endpoint/directory/users` through endpoint-session authentication. Tenant scope comes only from the authenticated Principal. Support bounded `q`, `limit`, and cursor pagination, deterministic ordering, and protocol error mapping.

### Task 3: Add Tauri Center directory client and command

**Files:**

- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src-tauri/src/center_auth/model.rs`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src-tauri/src/center_auth/client.rs`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src-tauri/src/center_auth/service.rs`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src-tauri/src/center_auth/commands.rs`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src-tauri/src/center_auth/mod.rs`

Add a host-owned `list_directory_users` operation using the in-memory access token. Return typed command errors and avoid persistence of the directory response in the credential store.

### Task 4: Add the frontend contract, client, and store

**Files:**

- Create: `/Users/jj.deng/Documents/open-source/tea-desktop/src/features/directory/contracts.ts`
- Create: `/Users/jj.deng/Documents/open-source/tea-desktop/src/features/directory/store.ts`
- Create: `/Users/jj.deng/Documents/open-source/tea-desktop/src/infrastructure/directory/tauriDirectoryClient.ts`
- Test: `/Users/jj.deng/Documents/open-source/tea-desktop/src/features/directory/store.test.ts`

Model tenant/member/OIDC/IM projections, cancellation-safe refresh, search and pagination state, and stale data behavior. Clear state on workspace disposal.

### Task 5: Add the directory workspace view

**Files:**

- Create: `/Users/jj.deng/Documents/open-source/tea-desktop/src/features/directory/components/DirectoryPage.vue`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src/app/components/WorkspaceRail.vue`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src/App.vue`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src/locales/en.ts`
- Modify: `/Users/jj.deng/Documents/open-source/tea-desktop/src/locales/zh-CN.ts`
- Test: `/Users/jj.deng/Documents/open-source/tea-desktop/src/app/components/WorkspaceRail.test.ts`

Add a compact, searchable user list with identity and IM readiness signals. Use existing light-theme layout conventions, no secret display, and explicit loading/error/offline/empty states.

### Task 6: Verify cross-layer behavior

Run focused Go, Rust, and Vitest tests, then `pnpm type-check`, `pnpm build`, `cargo check`, and relevant full test suites. Confirm locale parity and that a non-ready IM account cannot expose credentials.

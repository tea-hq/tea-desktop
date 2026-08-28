# OIDC And IM Self Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Preserve authenticated OIDC profile claims in Center, synchronize the safe profile subset to Yunxin, and let a signed-in Desktop user compare the Center and live IM profiles from an avatar-opened page.

**Architecture:** Center's identity directory owns the OIDC profile and exposes an allowlisted self projection through endpoint bootstrap. Runtime provisioning receives that profile from the directory and sends `name`, verified `email`, and `icon` to Yunxin; already-created accounts are refreshed through `updateUinfo.action`. Desktop extends the provider-neutral channel transport with a read-only self-profile capability, then projects Center and Yunxin values through a dedicated profile store.

**Tech Stack:** Go 1.26, PostgreSQL, Yunxin Server API, Tauri 2, Rust, Vue 3, TypeScript, Pinia, Tailwind CSS, Vitest.

---

### Task 1: Persist Authenticated OIDC Profile Claims

**Files:**

- Modify: `../tea-center/internal/identity/identity.go`
- Modify: `../tea-center/internal/auth/oidc_provider.go`
- Modify: `../tea-center/internal/identity/directory.go`
- Modify: `../tea-center/internal/postgres/migrations/00001_initial_schema.sql`
- Test: `../tea-center/internal/auth/oidc_provider_test.go`
- Test: `../tea-center/internal/identity/directory_test.go`

**Steps:**

1. Add failing tests for `name`, `nickname`, `preferred_username`, verified email, and a validated HTTPS `picture` claim.
2. Add an identity-owned `UserProfile` contract and normalize bounded profile fields without using them for authorization.
3. Store the profile during onboarding and refresh it on each successful member login.
4. Add a tenant- and user-scoped `GetUserProfile` query.
5. Run `go test ./internal/auth ./internal/identity`.

### Task 2: Synchronize Profile Fields To Yunxin

**Files:**

- Modify: `../tea-center/internal/runtimeconfig/types.go`
- Modify: `../tea-center/internal/runtimeconfig/service.go`
- Modify: `../tea-center/internal/runtimeconfig/yunxin.go`
- Modify: `../tea-center/cmd/center/main.go`
- Test: `../tea-center/internal/runtimeconfig/service_test.go`
- Test: `../tea-center/internal/runtimeconfig/yunxin_test.go`

**Steps:**

1. Add failing request tests proving `create.action` receives `name`, verified `email`, and `icon`.
2. Add `updateUinfo.action` coverage for existing/ready accounts.
3. Inject the identity profile source into runtime configuration without exposing AppSecret or IM token.
4. Bound every Yunxin field and keep upstream response bodies out of public errors and logs.
5. Run `go test ./internal/runtimeconfig ./cmd/center`.

### Task 3: Extend Endpoint Bootstrap Self Projection

**Files:**

- Modify: `../tea-center/internal/protocol/v1/endpoint_bootstrap.go`
- Modify: `../tea-center/internal/httpapi/endpoint_bootstrap.go`
- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/httpapi/endpoint_bootstrap_test.go`
- Modify: `src-tauri/src/center_auth/model.rs`
- Modify: `src/features/auth/contracts.ts`
- Test: `src-tauri/src/center_auth/service.rs`

**Steps:**

1. Add failing allowlist tests for display name, username, verified email, avatar URL, and OIDC subject.
2. Resolve profile server-side from the authenticated principal scope; accept no tenant/user selector from the client.
3. Extend the WIP bootstrap DTO directly and update Rust/TypeScript decoding tests.
4. Run focused Go, Rust, and TypeScript tests.

### Task 4: Add A Provider-Neutral Self Profile Port

**Files:**

- Modify: `src/features/channels/contracts.ts`
- Modify: `src/infrastructure/channels/YunxinWebChannelTransport.ts`
- Modify: `src/infrastructure/channels/MockChannelTransport.ts`
- Modify: `src/infrastructure/channels/TauriChannelTransport.ts`
- Test: `src/infrastructure/channels/YunxinWebChannelTransport.test.ts`

**Steps:**

1. Add a `profile.self` capability and a bounded `ChannelSelfProfile` DTO.
2. Add a failing Web transport test for `V2NIMUserService.getUserListFromCloud([selfAccount])`.
3. Map only `accountId`, `name`, `avatar`, and `email`; reject mismatched account IDs and oversized/control-bearing values.
4. Keep the retained sidecar adapter explicit as unsupported until its protocol gains this capability.
5. Run the channel transport test suite.

### Task 5: Build The Desktop Profile Feature

**Files:**

- Create: `src/features/profile/contracts.ts`
- Create: `src/features/profile/store.ts`
- Create: `src/features/profile/store.test.ts`
- Create: `src/features/profile/components/ProfilePage.vue`
- Create: `src/features/profile/components/ProfilePage.test.ts`
- Modify: `src/app/components/WorkspaceRail.vue`
- Modify: `src/App.vue`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Steps:**

1. Add store tests for loading, retry, disconnect, stale completion, and field-by-field comparison.
2. Implement a flat identity-ledger page using the existing Manrope/Fraunces/JetBrains Mono hierarchy.
3. Add the current-user avatar to the rail and open profile mode on click.
4. Render distinct loading, unavailable, aligned, and mismatched states; never render secrets or raw provider errors.
5. Run component, locale parity, and feature tests.

### Task 6: Verify The Cross-Layer Flow

**Files:**

- Create: `docs/adr/0017-oidc-im-self-profile.md`
- Modify: `docs/testing/center-auth-and-offline.md`

**Steps:**

1. Run `go vet ./...` and `go test ./...` in `tea-center`.
2. Run `pnpm test:run`, `pnpm type-check`, `pnpm build`, `cargo check`, and `cargo test` in `tea-desktop`.
3. Recreate the WIP Center database, configure the enterprise, sign in, and verify Yunxin returns the synchronized name/email/avatar.
4. Start Desktop with `pnpm tauri dev`, open the avatar profile, and capture desktop/mobile-width screenshots with no overlap or blank states.

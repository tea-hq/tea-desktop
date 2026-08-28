# Desktop OIDC Loopback Callback Implementation Plan

> **For Codex:** Execute this plan task-by-task with owning-layer tests before wiring outward.

**Goal:** Replace the `tea-desktop://` handoff with a bounded loopback HTTP
callback so enterprise login works in `tauri dev` and packaged applications.

**Architecture:** Desktop binds `127.0.0.1:0`, declares a nonce-bearing callback
URL in the desktop-login request, and owns a single-use Axum listener. Center
validates and persists that URL, then redirects the browser to it after issuing
the existing verifier- and device-bound handoff code.

**Tech Stack:** Go, PostgreSQL, Rust, Tokio, Axum, Tauri 2, reqwest.

---

### Task 1: Extend The Center Desktop Login Contract

**Files:**

- Modify: `../tea-center/internal/protocol/v1/desktop_auth.go`
- Modify: `../tea-center/internal/protocol/v1/desktop_auth_test.go`

1. Add required `callbackUrl` to `DesktopLoginRequest`.
2. Test the exact allowed literal IPv4 loopback shape and reject missing ports,
   localhost, alternate hosts, credentials, query/fragment, encoded paths, and
   malformed nonces.
3. Run `go test ./internal/protocol/v1` and confirm the validation tests pass.

### Task 2: Persist The Callback On The Server-Owned Transaction

**Files:**

- Modify: `../tea-center/internal/session/repository.go`
- Modify: `../tea-center/internal/session/service.go`
- Modify: `../tea-center/internal/session/postgres_repository.go`
- Modify: `../tea-center/internal/session/*_test.go`
- Modify: `../tea-center/internal/postgres/migrations/00001_initial_schema.sql`

1. Add `CallbackURL` to `DesktopTransaction` and the complete initial table.
2. Persist and scan it in PostgreSQL and retain it in memory.
3. Return callback URL with the issued handoff delivery.
4. Test round trips, expiry, and that request data is bound before browser use.

### Task 3: Redirect The Browser To The Stored Loopback URL

**Files:**

- Modify: `../tea-center/internal/httpapi/router.go`
- Modify: `../tea-center/internal/httpapi/desktop_oidc_test.go`
- Modify: `../tea-center/internal/app/app.go`
- Modify: `../tea-center/cmd/center/main.go`
- Modify: `../tea-center/docs/protocol/desktop-auth.md`

1. Remove `AppScheme` configuration.
2. Append the transaction and handoff code using `net/url` to the stored URL.
3. Test the exact `303` loopback location and absence of provider code and
   identity fields.
4. Run `go test ./...`.

### Task 4: Add The Desktop Single-Use Loopback Adapter

**Files:**

- Create: `src-tauri/src/center_auth/loopback.rs`
- Modify: `src-tauri/src/center_auth/model.rs`
- Modify: `src-tauri/src/center_auth/service.rs`

1. Write tests for bind URL shape, valid delivery, wrong path, duplicate query,
   oversized query, one-shot behavior, timeout, and shutdown.
2. Implement the listener with Axum on `127.0.0.1:0` and a random path nonce.
3. Add `callbackUrl` to the Center request.
4. Replace deep-link parsing with typed `(transaction, code)` completion.

### Task 5: Wire Callback Ownership Through Tauri

**Files:**

- Modify: `src-tauri/src/center_auth/commands.rs`
- Modify: `src-tauri/src/center_auth/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

1. Start the listener before creating the Center transaction.
2. Open the browser only after the pending transaction is installed.
3. Await one callback in a host task, exchange it, emit the typed state, and
   focus the main window.
4. Remove deep-link and single-instance dependencies and configuration.
5. Run focused Rust tests and `cargo check`.

### Task 6: Verify The Complete Flow

**Files:**

- Modify: `docs/adr/0014-center-endpoint-bootstrap.md`
- Modify: `docs/testing/center-auth-and-offline.md`

1. Update documentation and the acceptance matrix.
2. Run `pnpm test:run`, `pnpm type-check`, `pnpm build`,
   `cargo test --manifest-path src-tauri/Cargo.toml`, and Center `go test ./...`.
3. Rebuild/recreate Center API and Gateway.
4. Preserve the local WIP tenant data with an equivalent one-time development
   `ALTER TABLE`; production WIP deployments recreate the database from the
   complete initial schema.
5. Start Desktop with `TEA_CENTER_ORIGIN=https://workshop.netease.im:8081`
   and verify the sequence reaches exchange and bootstrap without a custom URI
   scheme.

No commits are created until the user explicitly requests them.

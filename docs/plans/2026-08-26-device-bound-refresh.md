# Device-Bound Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Require proof of possession of the desktop device key whenever a Center refresh credential is rotated.

**Architecture:** Center issues a versioned refresh credential that contains a random secret and the registered Ed25519 public-key reference. The desktop signs a domain-separated payload containing the complete current credential. Center validates the credential shape, key reference, and signature before atomically rotating it. Legacy bearer-only credentials are rejected and require a fresh OIDC login.

**Tech Stack:** Go 1.26, Rust, Ed25519, Base64URL, Tauri 2, PostgreSQL repository tests

---

### Task 1: Lock the Center protocol contract

**Files:**

- Modify: `../tea-center/internal/protocol/v1/desktop_auth.go`
- Test: `../tea-center/internal/protocol/v1/desktop_auth_test.go`

1. Add a required `deviceProof` to `RefreshRequest`.
2. Reject bearer-only and malformed refresh requests.
3. Run `go test ./internal/protocol/v1` and verify the new tests fail before implementation and pass afterward.

### Task 2: Verify device possession before rotation

**Files:**

- Modify: `../tea-center/internal/session/service.go`
- Test: `../tea-center/internal/session/service_test.go`
- Test: `../tea-center/internal/session/postgres_repository_test.go`

1. Issue refresh credentials as `v1.<random-secret>.<device-public-key-ref>`.
2. Define the signed payload as `tea-center-refresh-v1\n<complete-refresh-credential>`.
3. Verify the Ed25519 proof before calling `RotateRefresh`.
4. Preserve the same key reference when issuing the rotated credential.
5. Test valid rotation, missing proof, a copied credential signed by another key, malformed legacy credentials, and replay/reuse behavior.

### Task 3: Sign refresh requests in Desktop

**Files:**

- Modify: `src-tauri/src/center_auth/device_identity.rs`
- Modify: `src-tauri/src/center_auth/model.rs`
- Modify: `src-tauri/src/center_auth/client.rs`
- Modify: `src-tauri/src/center_auth/service.rs`
- Test: corresponding Rust module tests

1. Add the same domain-separated refresh payload to `DeviceIdentity`.
2. Build `DeviceProof` for every refresh call, including startup restoration and access-token recovery.
3. Verify request JSON contains the proof and that signatures validate against the stored device public key.
4. Run focused Center auth tests.

### Task 4: Record and verify the cross-layer boundary

**Files:**

- Create: `docs/adr/0018-device-bound-refresh-credentials.md`

1. Document the threat model, wire contract, forced reauthentication for legacy credentials, rollback, and recovery.
2. Run `go test ./...` and `go vet ./...` in `tea-center`.
3. Run `cargo test --manifest-path src-tauri/Cargo.toml center_auth` and `cargo check --manifest-path src-tauri/Cargo.toml` in `tea-desktop`.

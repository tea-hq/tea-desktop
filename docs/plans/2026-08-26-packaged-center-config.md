# Packaged Center Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow packaged Tea Desktop builds to embed a Center origin and default enterprise domain while preserving runtime environment overrides and an editable login form.

**Architecture:** Rust resolves and validates non-secret build/runtime configuration at process startup. A typed initialization response carries only the default enterprise domain to the Vue auth store; Center origin remains host-owned and is never exposed to the WebView. The store fills an empty domain from that response, while the existing explicit button continues to start the OIDC browser handoff.

**Tech Stack:** Rust/Tauri 2, serde IPC DTOs, Vue 3, Pinia, TypeScript, Vitest, Cargo tests.

---

### Task 1: Add host-owned packaged configuration

**Files:**

- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/src/center_auth/client.rs`
- Modify: `src-tauri/src/center_auth/commands.rs`
- Modify: `src-tauri/src/center_auth/model.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/center_auth/client.rs`

Resolve `TEA_CENTER_ORIGIN` and `TEA_CENTER_ENTERPRISE_DOMAIN` with runtime values taking precedence over compile-time values. Validate the origin with the existing security rules and normalize the enterprise domain with the existing domain validator. Add Cargo environment rerun directives and return a typed initialization payload containing auth state plus the non-secret default domain.

### Task 2: Apply the default domain in the frontend auth boundary

**Files:**

- Modify: `src/features/auth/contracts.ts`
- Modify: `src/infrastructure/auth/tauriCenterAuthClient.ts`
- Modify: `src/features/auth/store.ts`
- Modify: `src/App.vue`
- Test: `src/features/auth/store.test.ts`

Extend the initialization contract, populate the domain only when the current input is empty, and keep the existing login sequence and editable input behavior. Browser launch remains user-triggered by the existing submit action.

### Task 3: Verify and document packaged deployment

**Files:**

- Modify: `docs/adr/0014-center-endpoint-bootstrap.md`
- Modify: `docs/testing/center-auth-and-offline.md`
- Test: `src/features/auth/components/EnterpriseLogin.test.ts`

Document the build command, precedence, validation, and expected first-launch flow. Cover default-domain initialization and the no-default fallback in tests, then run frontend and Rust checks.

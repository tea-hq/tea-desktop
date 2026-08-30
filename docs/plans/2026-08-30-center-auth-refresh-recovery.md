# Center Auth Refresh Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore automatic sign-in by making Tea Desktop use Tea Center's canonical refresh-proof payload and by keeping Center wire errors out of renderer state.

**Architecture:** Tea Center owns the desktop authentication wire protocol. Electron main constructs and signs the exact protocol payload, maps Center error codes to stable `CenterAuthErrorCode` values, and owns credential invalidation; the renderer store only projects those typed states and Vue localizes them.

**Tech Stack:** Electron, TypeScript, Vue 3, Pinia, Vitest, Node.js Ed25519, Go protocol documentation.

---

## Problem And Invariants

Tea Desktop currently signs the raw refresh credential, while Tea Center verifies `tea-center-refresh-v1\n<refreshCredential>`. A cold-start refresh therefore fails device-proof verification and returns `authorization_denied`.

- The canonical refresh proof is the exact UTF-8 byte sequence defined by Tea Center.
- Desktop never retries with the obsolete payload and Center never accepts both payloads.
- Refresh credentials and private keys remain Electron-main-only and encrypted at rest.
- A Center outage preserves `offlineCached`; a definitive authorization or session failure invalidates the cached credential and requires login.
- Renderer state contains stable Desktop error codes, never raw Center wire codes.

## Task 1: Add Auth Service Regression Coverage

**Files:**

- Create: `electron/services/centerAuth.test.ts`

1. Create a temporary versioned auth file containing an encrypted private key, refresh credential, and cached bootstrap.
2. Mock Electron `safeStorage` as a reversible test boundary and mock the Center fetch calls.
3. Verify the refresh signature against `tea-center-refresh-v1\n<refreshCredential>` with the registered Ed25519 public key.
4. Assert cold-start state transitions through `offlineCached` to `authenticated` and persists the rotated credential.
5. Return `403 authorization_denied` and assert `recoveryRequired`, the stable Desktop error code, and credential invalidation.
6. Run `npx vitest run electron/services/centerAuth.test.ts` and confirm the new assertions fail before implementation.

## Task 2: Implement The Main-Process Contract

**Files:**

- Create: `electron/services/centerAuthProtocol.ts`
- Create: `electron/services/centerAuthProtocol.test.ts`
- Modify: `electron/services/centerAuth.ts`
- Modify: `src/features/auth/contracts.ts`

1. Define the exact handoff and refresh proof payload constructors in an Electron-main protocol module.
2. Add a typed mapping from Center snake_case wire errors to Desktop auth error codes.
3. Use the payload constructors for both exchange and refresh signing.
4. Keep unknown or invalid Center responses mapped to `protocolFailure` and 5xx/network failures mapped to `centerUnavailable`.
5. Run the focused protocol and service tests and confirm they pass.

## Task 3: Complete Renderer Localization And Documentation

**Files:**

- Modify: `src/features/auth/store.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/features/auth/store.test.ts`
- Modify: `src/features/auth/components/EnterpriseLogin.test.ts`
- Modify: `../tea-center/docs/protocol/desktop-auth.md`

1. Treat `authorizationDenied` as a recovery-required terminal state in the renderer projection.
2. Add matching English and Chinese `authorizationDenied` messages.
3. Test the store transition and rendered message.
4. Document the refresh `deviceProof`, exact domain-separated payload, key binding, and Base64URL encoding in Tea Center's protocol document.

## Task 4: Verify

1. Run focused auth tests in Tea Desktop.
2. Run `npm run type-check`, `npm run test:run`, `npm run format:check`, `npm run lint`, `node scripts/check-ui-boundaries.mjs`, and `npm run build:web`.
3. Run `git diff --check` in both repositories and review the complete diff.
4. Do not run Electron packaging and do not commit without explicit user instruction.

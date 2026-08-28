# Center Authentication And Offline Acceptance

## Automated Checks

```bash
pnpm test:run
pnpm type-check
pnpm sidecar:test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml

cd ../tea-center
go test ./...
go test -race ./...
go vet ./...

cd ../tea-center-frontend
pnpm test:run
pnpm type-check
pnpm build
```

Run the opt-in live Center contract check with one active configured tenant:

```bash
TEA_CENTER_ORIGIN=https://workshop.netease.im:8081 \
TEA_CENTER_TEST_DOMAIN=enterprise.example.test \
cargo test --manifest-path src-tauri/Cargo.toml \
  live_center_creates_a_domain_bound_desktop_login_when_configured --lib
```

The live test verifies the public directory projection and creation of a
domain-bound Desktop transaction. The default Rust test suite also runs a local
fake Center/OIDC handoff through discovery, desktop transaction creation,
single-use loopback delivery, exchange, bootstrap, persistence, and logout.
Center has independent fake-provider tests for provider state/PKCE, callback
routing, one-time handoff issuance, refresh rotation/reuse, and bootstrap
authorization.

Build a packaged app with a fixed Center and enterprise default:

```bash
TEA_CENTER_ORIGIN=https://workshop.netease.im:8081 \
TEA_CENTER_ENTERPRISE_DOMAIN=enterprise.example.test \
pnpm tauri build
```

Both values are embedded during the Rust build so a GUI-launched packaged app
does not depend on the shell environment used to build it. A runtime environment
value takes precedence when present. On first launch, the enterprise field is
pre-filled with the normalized default domain; clicking Continue performs the
normal Center discovery and OIDC browser handoff. The field remains editable,
and omitting `TEA_CENTER_ENTERPRISE_DOMAIN` preserves the manual-entry flow.

## Acceptance Matrix

| Scenario                                                                             | Expected result                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Malformed domain                                                                     | Host returns `invalidDomain`; browser is not opened.                                                                                                                                                                                             |
| Unknown, inactive, suspended, or unconfigured tenant                                 | Generic `organizationUnavailable`; browser is not opened.                                                                                                                                                                                        |
| Active configured tenant                                                             | Host binds `127.0.0.1` first, then the system browser opens the Center-owned single-use URL.                                                                                                                                                     |
| Callback transaction mismatch, duplicate query, wrong nonce/path, or oversized query | Host rejects the callback and sends no exchange.                                                                                                                                                                                                 |
| Callback listener bind failure or five-minute timeout                                | Login returns to a retryable signed-out state and the listener closes.                                                                                                                                                                           |
| User cancels while discover, browser login, or exchange is pending                   | The active generation is invalidated, the listener closes, and the editable form reports `loginCancelled`.                                                                                                                                       |
| Two login commands overlap                                                           | The newer generation owns the only callback task; stale responses cannot install state or credentials.                                                                                                                                           |
| Successful exchange                                                                  | Refresh credential is in the OS credential facility, access token is memory-only, and safe bootstrap is cached.                                                                                                                                  |
| Successful OIDC login with profile claims                                            | Center stores bounded display name, preferred username, profile email, its separate verification assertion, and validated HTTPS avatar. An omitted `email_verified` keeps the email visible but cannot populate Principal email or grant access. |
| Restart with valid refresh                                                           | Credential rotates, bootstrap is revalidated, and the workspace opens authenticated.                                                                                                                                                             |
| Center unavailable with refresh and safe cache                                       | Workspace opens as `offlineCached` with the last validation time.                                                                                                                                                                                |
| Retry from `offlineCached` after Center recovers                                     | Refresh credential rotates first, bootstrap becomes authenticated, managed credentials refresh, then IM connects.                                                                                                                                |
| Retry from `offlineCached` while Center is unavailable                               | Cached workspace and refresh credential remain intact; managed credentials and IM are not requested.                                                                                                                                             |
| First launch while Center is unavailable                                             | Remains signed out.                                                                                                                                                                                                                              |
| Revoked or reused refresh                                                            | Credential and safe cache are cleared and state becomes `recoveryRequired`.                                                                                                                                                                      |
| Bootstrap schema other than v1                                                       | Credential and safe cache are cleared; managed configuration is rejected and recovery requires login.                                                                                                                                            |
| Enabled IM configuration without a provisioned account                               | Center claims one stable account, provisions it, and returns a ready or stable unavailable resource without exposing upstream payloads.                                                                                                          |
| New Yunxin account provisioning                                                      | `create.action` receives the stable account/token plus bounded `name`, profile `email`, and HTTPS `icon` derived from the authenticated OIDC UserInfo response.                                                                                  |
| Existing or ready Yunxin account                                                     | `updateUinfo.action` refreshes the same safe profile subset before Center returns the runtime as ready.                                                                                                                                          |
| Ready managed runtime configuration                                                  | Rust stores tenant/user-scoped secrets, publishes a new Tea runtime generation, and makes only the active IM credential available to the dedicated Web transport. Provider keys and safe status/catalog DTOs retain their existing boundaries.   |
| IM ready and model Provider unavailable                                              | Channels connect automatically while Agent model status is degraded; the inverse also degrades only IM.                                                                                                                                          |
| IM credential rotates                                                                | The Web transport reloads it through IPC, compares an in-memory digest, and performs one clean SDK logout/login when changed.                                                                                                                    |
| User opens the Desktop avatar profile                                                | Center/OIDC values render immediately; the Web transport calls `getUserListFromCloud` for exactly the connected account and shows field-level matched/different states.                                                                          |
| IM self-profile account mismatch, unsafe value, or provider failure                  | The profile page shows a stable unavailable state, never renders the hostile value or raw provider error, and offers retry.                                                                                                                      |
| Retained sidecar profile lookup                                                      | `profile.self` is explicitly unsupported; no sidecar command or duplicate profile implementation is invoked.                                                                                                                                     |
| Logout during credential load or SDK login                                           | Disposal generation fences the late result; it cannot restore connected state.                                                                                                                                                                   |
| Retained sidecar malformed, oversized, duplicate, or out-of-order frame              | Its independent tests terminate/fail safely even though the current product does not start or package it.                                                                                                                                        |
| Offline cached workspace                                                             | Managed Keychain values and active IM memory are cleared; only safe bootstrap and local capabilities remain.                                                                                                                                     |
| Logout while Center revoke is unavailable                                            | Web SDK disposal and projections clear first, managed Keychain values and active IM memory clear next, local refresh/cache clears, and remote revocation failure does not keep the user signed in.                                               |
| Tenant A logout followed by tenant B login                                           | A's transport is disposed and all projections are empty before a fresh B transport initializes.                                                                                                                                                  |
| Late initialization or callback after logout                                         | Generation mismatch discards it; the signed-out state and empty workspace remain authoritative.                                                                                                                                                  |

## Manual Inspection

Inspect Keychain, `center-profile.sqlite3`, settings JSON, Pinia state,
localStorage, and logs.
The refresh credential, access token, handoff code/verifier, device private key,
OIDC client secret, IM app secret, IM account token, and model credentials must
not appear in SQLite, settings, Pinia, localStorage, console output, or
application logs. The IM app key/account/token is expected only in the active
Web transport and vendor SDK memory until disposal.

Open the current-user avatar after an online login and compare the Center/OIDC
display name, preferred username, email and verification status, avatar, and
subject with the live Yunxin account, name, email, and avatar. Refresh must issue a new cloud
lookup. Disconnecting IM must retain the Center identity while replacing the
live column with a bounded unavailable state. Changing tenant or signing out
must clear both profile projections and fence any late cloud response.

Offline cached mode does not imply current tenant membership and does not add
offline message history. It exposes only the last safe bootstrap projection and
locally available capabilities. Message persistence remains deferred to its own
encrypted and bounded repository design.

## Packaged macOS Smoke Test

```bash
TEA_CENTER_ORIGIN=https://workshop.netease.im:8081 pnpm tauri build --debug
```

The build embeds this public origin as the packaged fallback. A runtime
`TEA_CENTER_ORIGIN` still overrides it for terminal-driven diagnostics.

1. Launch the generated `.app`, sign in, and confirm the browser returns to a
   random `127.0.0.1` callback page before Desktop opens the workspace.
2. Quit and relaunch the `.app`; valid Keychain refresh material must restore
   the authenticated workspace without another browser login.
3. Sign out with Center unavailable; relaunch must remain signed out and
   `center-profile.sqlite3` must contain no profile row.
4. Confirm no `tea-channel-sidecar` process or bundled external binary exists,
   then inspect Keychain, SQLite, Pinia, localStorage, and logs again for the
   forbidden values listed above.

The macOS Rust suite also writes, reloads through a fresh Keychain Entry, and
deletes a uniquely named temporary probe without touching Center credentials.

## P1 Verification Record

On 2026-08-25 the unified Compose stack was rebuilt from an empty WIP database.
PostgreSQL initialized schema version 1, the migration job exited successfully,
and the API, administration frontend, and TLS Gateway became healthy. A
dedicated validation tenant exercised application approval, IM and model
Provider writes, and the authenticated runtime-configuration endpoint.

The runtime response used `Cache-Control: no-store`, rejected query/body scope
selectors with `400`, rejected an absent endpoint session with `401`, kept the
model Provider ready, and reported the deliberately invalid IM application as
the stable `provider_rejected` resource error. Safe API responses, service
logs, audit payloads, and encrypted-secret ciphertext were scanned for the
validation plaintext values with no matches.

The initial P1 verification covered 24 Center frontend tests, 97 Desktop
frontend tests, 6 sidecar tests, and 126 Rust tests, plus Center unit, race,
vet, module, and live PostgreSQL HTTP integration checks. The later WebView
switch adds Web SDK credential rotation, redaction, and disposal-race tests.
`pnpm tauri build --debug` must produce the macOS application and DMG without a
bundled sidecar. Browser inspection covered 1440x900 and 390x844 layouts with
no console warnings or errors.

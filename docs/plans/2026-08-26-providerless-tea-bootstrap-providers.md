# Resilient Tea And Tenant Provider Bootstrap Implementation Plan

**Goal:** Keep Tea available without blocking Desktop while making the local Center bootstrap configure tenant model providers.

**Architecture:** Desktop treats Tea's process configuration (`TEA_CONFIG_DIR` or `~/.tea`) as the local baseline and builds one runtime generation containing the union of local and authenticated Center providers. Runtime identities are source-qualified as `local.<id>` and `center.<id>`, so providers with the same original ID coexist. Managed failures restore the local-only generation. Center's local bootstrap accepts explicit model-provider inputs or imports them from the same local Tea configuration before writing through the existing optimistic-revision administration API; Vue only selects a runtime, while first prompt submission creates the conversation.

**Tech Stack:** Rust, Tauri 2, Vue 3, TypeScript, Pinia, Go 1.26, Center HTTP protocol v1

---

### Task 1: Extend Center Tenant Bootstrap

**Files:**

- Modify: `../tea-center/internal/adminbootstrap/config.go`
- Modify: `../tea-center/internal/adminbootstrap/config_test.go`
- Modify: `../tea-center/internal/adminbootstrap/client.go`
- Modify: `../tea-center/internal/adminbootstrap/client_test.go`
- Modify: `../tea-center/scripts/bootstrap-tenant.sh`
- Create: `../tea-center/scripts/bootstrap-tenant-model-providers.jq`
- Modify: `../tea-center/deploy/tenant-bootstrap.example.json`
- Modify: `../tea-center/docs/adr/0005-local-tenant-bootstrap.md`
- Modify: `../tea-center/docs/deployment/wip-reset-and-bootstrap.md`
- Modify: `../tea-center/docs/deployment/wip-reset-and-bootstrap.zh-CN.md`

1. Add strict `modelProviders` and nested model definitions to the bootstrap contract.
2. Import provider definitions from `TEA_CONFIG_DIR` or `~/.tea` only when the tenant JSON omits `modelProviders`; explicit tenant values remain authoritative.
3. Add failing decode and HTTP workflow tests for required providers, secret redaction, provider payloads, and revision chaining.
4. Save IM first, then each model provider using the revision returned by the prior write.
5. Update the example and local deployment documentation.
6. Run `go test ./internal/adminbootstrap` and exercise the jq import with secret-redacted output.

### Task 2: Enforce The Ready Provider Contract

**Files:**

- Modify: `../tea-center/internal/tenantconfig/service.go`
- Modify: `../tea-center/internal/tenantconfig/service_test.go`
- Modify: `src-tauri/src/managed_runtime/service.rs`

1. Add failing tests proving enabled Center providers require at least one model.
2. Let Desktop retain disabled or unavailable zero-model resources while rejecting a ready zero-model provider.
3. Mark an authenticated managed workspace degraded when it has no ready Tea provider.
4. Run focused Go and Rust tests.

### Task 3: Preserve Local Tea As The Managed Fallback

**Files:**

- Modify: `../tea-rs/crates/tea-coding/src/config/process.rs`
- Modify: `../tea-rs/crates/tea-coding/src/config/mod.rs`
- Modify: `src-tauri/src/conversation/tea.rs`
- Modify: `src-tauri/src/conversation/registry.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Modify: `src-tauri/src/managed_runtime/service.rs`
- Modify: `docs/adr/0016-host-owned-managed-runtime-credentials.md`

1. Extend the product-neutral `tea-coding` process facade to return every valid local provider while preserving the selected provider and settings.
2. Keep process-provider construction as the local startup baseline without exposing credentials to Vue.
3. Merge local and Center provider maps after authenticated managed configuration succeeds, using source-qualified identities so duplicate original IDs coexist.
4. Keep source and original provider identity available for future grouped UI projection. Preserve the session's selected model even when its provider is unavailable; only an explicit user selection changes it.
5. Restore the process Tea generation on logout, offline mode, empty Center providers, and managed activation failure.
6. Preserve old runtime handles while new conversations resolve the latest generation.
7. Add Rust tests for multi-provider process loading, disjoint union, duplicate-ID coexistence, and local fallback, then run focused Rust tests.

### Task 4: Defer Collaboration Conversation Creation Until Send

**Files:**

- Modify: `src/features/collaboration/store.ts`
- Modify: `src/features/collaboration/store.test.ts`
- Modify: `src/features/collaboration/components/ChannelConversationPanel.vue`
- Modify: `src/features/collaboration/components/ChannelConversationChooser.vue`
- Create: `src/features/collaboration/components/ChannelConversationPanel.test.ts`
- Modify: `src/App.vue`

1. Add failing store tests proving unconfigured Tea remains listed, selection performs no IPC, and first send creates then sends.
2. Add a component test proving Tea selection emits only local selection and leaves the composer usable.
3. Remove the ready-only filters and make runtime selection clear the active collaboration projection without creating a backend session.
4. Create the bound conversation inside `sendMessage` when needed and surface creation failure in the existing error projection.
5. Refresh both runtime catalogs after managed runtime generation changes.
6. Run focused Vitest tests and type checking.

### Task 5: Verify End To End

1. Run all Desktop frontend tests, type checking, and build.
2. Run Desktop Rust check and tests.
3. Run Center tests and vet.
4. Bootstrap the local tenant with the configured provider and inspect the secret-free administrator/runtime projections.
5. Review diffs without committing; a commit requires explicit user instruction.

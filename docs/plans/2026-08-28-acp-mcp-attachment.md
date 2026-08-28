# ACP MCP Attachment Implementation Plan

> **For implementers:** Use the repository implementation workflow and execute
> this plan task-by-task. Do not commit without explicit user approval.

**Goal:** Connect command-based ACP MCP stdio to Electron main's authoritative
`ConversationToolBroker` through the authenticated local attachment accepted in
ADR 0024.

**Architecture:** Electron main owns the official MCP Server, a one-session
local listener, and an in-memory capability. A separately built Electron-as-Node
relay consumes a one-time private capability file, authenticates, then blindly
relays standard MCP bytes between Agent stdio and the main-owned socket.

**Tech Stack:** Electron 44, Node `net`/`stream`/`fs` APIs, TypeScript 6,
official `@modelcontextprotocol/sdk@1.30.0`, ACP V1/V2 schema types, and Vitest.

---

## Problem And Invariants

- The MCP relay cannot execute tools or own conversation state.
- The capability value cannot enter ACP, argv, environment, logs, persistence,
  renderer state, or test fixtures.
- Attachment setup and teardown are bounded and idempotent.
- After the V1 attachment handshake, every byte is standard MCP stdio.
- The official MCP SDK remains the only MCP JSON-RPC codec in production.
- Empty selection creates no attachment.
- An active session never observes a silently changed broker scope.
- Tests use explicit events and injected schedulers, not sleeps.

## Task 1: Define The Local Attachment Protocol

**Files:**

- Create: `electron/conversation/acp/mcpAttachmentProtocol.ts`
- Create: `electron/conversation/acp/mcpAttachmentProtocol.test.ts`

1. Add a V1 credential document containing protocol version, endpoint, and a
   256-bit base64url capability.
2. Add bounded parsing for credential documents, request prefaces, and
   acknowledgements.
3. Compare capabilities with `timingSafeEqual` and reject wrong version,
   missing fields, NULs, excess bytes, trailing bytes, and malformed tokens.
4. Test valid/invalid documents and exact wire bytes without real sockets.

## Task 2: Implement Main-Owned Attachment Lifecycle

**Files:**

- Create: `electron/conversation/acp/mcpAttachment.ts`
- Create: `electron/conversation/acp/mcpAttachment.test.ts`
- Modify: `electron/conversation/acp/mcpServer.ts`

1. Create a private temporary directory, endpoint, capability file, and local
   listener before returning ACP configuration.
2. Bound connection attempts, handshake bytes, startup timeout, and MCP input.
3. On successful authentication, connect `AcpConversationMcpServer` through
   official `StdioServerTransport` over the paused socket, acknowledge, then
   resume the byte stream.
4. Close listener, socket, MCP server, timer, capability file, and temporary
   directory exactly once on every failure and shutdown path.
5. Test unauthorized clients, partial prefaces, excess bytes, timeout,
   successful attachment, duplicate clients, and idempotent cleanup with local
   sockets and an injected scheduler.

## Task 3: Implement The Transparent Relay

**Files:**

- Create: `electron/conversation/acp/mcpProxy.ts`
- Create: `electron/conversation/acp/mcpProxy.test.ts`
- Create: `electron/conversation/acp/mcpProcess.ts`

1. Read a bounded absolute capability-file path, validate the file, parse its
   credential, and remove it immediately.
2. Connect to the endpoint, send the exact preface, wait for the exact bounded
   acknowledgement, then pipe stdin/socket/stdout without parsing MCP.
3. Use a fixed stderr diagnostic and non-zero exit code without printing
   endpoint, paths, tokens, payloads, or stack traces.
4. Test deletion on success/failure, partial acknowledgement, timeout, socket
   failure, stdin end, output relay, and secret-free diagnostics.

## Task 4: Build And Resolve The Relay Entrypoint

**Files:**

- Modify: `vite.config.ts`
- Modify: `electron/electron-env.d.ts`
- Create: `electron/conversation/acp/mcpEntrypoint.ts`
- Create: `electron/conversation/acp/mcpEntrypoint.test.ts`

1. Build `electron/main.ts` and `mcpProcess.ts` as named Electron main-process
   entries.
2. Resolve only the sibling built `mcp-process.js` entrypoint and the absolute
   current Electron executable.
3. Produce V1 and V2 standard stdio MCP configurations with an argument array
   and only `ELECTRON_RUN_AS_NODE=1` in the MCP-specific environment.
4. Test absolute paths, missing entrypoints, V1/V2 shapes, and absence of
   capability/endpoint values from configuration.

## Task 5: Attach Immutable Tool Selection To ACP Session Setup

**Files:**

- Modify: `electron/conversation/acp/session.ts`
- Modify: `electron/conversation/acp/runtime.ts`
- Modify: `electron/conversation/acp/runtime.test.ts`

1. Allow HostTools to be configured only before conversation creation and open
   one immutable broker scope for that ACP session.
2. Create no attachment for an explicit empty selection.
3. Create the attachment before ACP session setup or restore, pass the exact
   V1/V2 MCP config to `session/new`, `session/load`, or `session/resume`, and
   keep it owned by the session actor.
4. Close it on creation failure, connection exit, and session/runtime shutdown;
   ordinary turn cancellation keeps the multi-turn session attachment alive.
   Reject post-creation reconfiguration with a stable typed error.
5. Keep the runtime `unavailable` until restore, catalog, client services, and
   the full compatibility matrix are complete.

## Task 6: Verify And Document

**Files:**

- Update: `docs/adr/0022-official-acp-electron-runtime.md`
- Update: `docs/plans/2026-08-28-acp-foundation.md`
- Create: `docs/testing/acp-mcp-attachment.md`

Run:

```bash
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

Expected: attachment and session tests pass, the build contains the relay
entrypoint, ACP remains unavailable/unregistered, and no packaging command,
network call, real Agent, credential, or captured transcript is used.

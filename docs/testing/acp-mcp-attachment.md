# ACP MCP Attachment Verification

This checklist verifies the authenticated local attachment defined by ADR 0024.
It covers Electron main ownership and the transparent relay used by the active
ACP runtime.

## Automated Coverage

Run the focused suite while iterating:

```sh
npx vitest run \
  electron/conversation/acp/mcpAttachmentProtocol.test.ts \
  electron/conversation/acp/mcpAttachment.test.ts \
  electron/conversation/acp/mcpProxy.test.ts \
  electron/conversation/acp/mcpEntrypoint.test.ts \
  electron/conversation/acp/runtime.test.ts
```

The tests must prove:

- credential documents, prefaces, and acknowledgements are versioned, bounded,
  exact, and reject malformed or trailing bytes;
- unauthorized, duplicate, timed-out, and mid-attachment connections fail
  without publishing readiness;
- the one-time credential is removed before relay attachment and diagnostics
  contain no endpoint, path, capability, payload, or stack trace;
- all post-handshake traffic is relayed without a private MCP codec;
- explicit empty HostTool selection creates no attachment or ACP MCP entry;
- V1 and V2 `session/new` receive their exact official SDK MCP server shape;
- attachment failure fails session creation, attachment loss fails an active
  turn, and ordinary turn cancellation retains the attachment;
- creation failure, connection exit, and repeated shutdown close attachment,
  Agent connection, and broker scope idempotently;
- HostTool scope cannot change after conversation creation starts.

Then run the repository checks from `AGENTS.md`:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

The web build must contain both `dist-electron/main.js` and
`dist-electron/mcp-process.js`.

## Security Review

Inspect ACP `session/new` fixtures and relay diagnostics. They may contain only
the absolute Electron executable, relay entrypoint, one-time credential-file
path, and `ELECTRON_RUN_AS_NODE=1`. They must not contain the endpoint or
capability value.

On POSIX systems, verify the generated directory and credential/socket modes in
the attachment tests. The directory must be `0700`; the credential and socket
must be `0600`. The capability is not a sandbox against malicious code already
running as the same OS user.

## Packaged Follow-Up

Packaging is a separate release check and is not part of normal validation.
When explicitly requested, run it with
`CSC_IDENTITY_AUTO_DISCOVERY=false` and verify on each supported OS that:

- the packaged relay is beside Electron main and resolves without system Node;
- V1 and V2 Agents can launch the command-based stdio MCP configuration;
- quitting the app, killing the Agent, and killing the relay remove private
  attachment state and leave no usable listener;
- no signing credential, user transcript, network dependency, or real secret
  appears in fixtures or diagnostics.

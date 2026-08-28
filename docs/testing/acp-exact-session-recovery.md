# ACP Exact Session Recovery Testing

The recovery suite uses synthetic in-memory ACP connections. It does not start
real Claude or Codex Agents, access a network, read credentials, package
Electron, or use captured transcripts.

## Covered Boundaries

- a runtime binding records exact Agent revision, artifact integrity, wire
  version, workspace, native session id, and HostTool references;
- malformed, unknown, or changed binding fields fail before process launch;
- recovery connects with only the recorded wire version and never negotiates a
  downgrade;
- official initialization facts normalize V1 load/resume and V2 resume support;
- V1 load installs the replay collector before the request and publishes a
  snapshot only after the response and complete replay;
- V1 and V2 resume restore the recorded native session and reattach exact MCP
  configuration without claiming complete historical Snapshot or History;
- replay rejects wrong session/version, output before a prompt, unsupported
  visible content, unfinished tools, malformed ordering, and configured bounds;
- the first handler/replay failure is latched so a later successful protocol
  response cannot publish partial history;
- complete snapshots are immutable clones, and history cursors page backward
  with stable typed errors for invalid limits and cursors;
- restore failure and shutdown close ACP, MCP, process, and broker resources
  idempotently.

## Focused Command

```sh
npx vitest run electron/conversation/acp/binding.test.ts \
  electron/conversation/acp/connection.test.ts \
  electron/conversation/acp/replay.test.ts \
  electron/conversation/acp/runtime.test.ts
```

Repository validation also runs `npm run type-check`, the complete test suite,
formatting, lint, UI boundary checks, and the web build. Electron packaging and
signing are intentionally excluded.

## Remaining Release Checks

Production activation now uses durable catalog bindings and the atomic Agent
artifact gate. Target-specific packaged artifact validation and opt-in
compatibility tests against each pinned official ACP Agent remain. Fixtures
must remain synthetic; a resume-only session is valid recovery and must not be
forced through load.

# Packaged Electron ACP Process Verification

## Managed Closure

The application lockfile pins the external Agent process closure:

| Role                   | Package                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Claude ACP entry point | `@agentclientprotocol/claude-agent-acp@0.70.0`                                            |
| Claude SDK/CLI         | `@anthropic-ai/claude-agent-sdk@0.3.232` plus one target-specific optional binary package |
| Codex ACP entry point  | `@agentclientprotocol/codex-acp@1.7.0`                                                    |
| Codex launcher/CLI     | `@openai/codex@0.148.0` plus one target-specific optional vendor package                  |
| Tea ACP Client         | `@agentclientprotocol/sdk@1.4.0`                                                          |

Electron main verifies both adapter package names, versions, and package-owned
entry points before publishing the runtime registry. It spawns those JavaScript
entry points with Electron as Node (`ELECTRON_RUN_AS_NODE=1`), an explicit
argument vector, `shell: false`, and the selected workspace as `cwd`.

`electron-builder.json5` unpacks these paths from ASAR:

```text
dist-electron/mcp-process.js and its mcpAttachmentProtocol chunk
@agentclientprotocol/claude-agent-acp
@agentclientprotocol/codex-acp
@anthropic-ai/claude-agent-sdk
@anthropic-ai/claude-agent-sdk-<platform>-<arch>[-musl]
@openai/codex
@openai/codex-<platform>-<arch>
```

This includes Tea's MCP relay, the Agent child JavaScript entry points, and
native Claude/Codex, `rg`, shell, and resource files shipped by the selected
platform package. Runtime launch does not call `npx`, npm, pnpm, a shell
resolver, or system Node.

## Release Smoke Matrix

Run on every supported target from a clean lockfile installation:

| Scenario                                        | Expected result                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Inspect `app.asar.unpacked`                     | Both adapter entry points and the current target's native packages exist                   |
| Remove system Node/package managers from `PATH` | Both ACP Agents still initialize through packaged Electron                                 |
| Start Claude and Codex conversations            | Exact pinned adapters answer initialization and `session/new`                              |
| Create a Channel-bound conversation             | Packaged MCP relay attaches and one bounded HostTool call completes                        |
| Quit during an active turn                      | Agent, native child, MCP relay, socket, and pending approval close                         |
| Rename/remove an unpacked executable            | Host startup or process launch fails with a stable typed error; no partial registry        |
| Inspect argv, environment, catalog, and logs    | No credential, transcript, MCP capability, or unbounded stderr is present                  |
| Restart a recorded session                      | Exact wire/artifact/HostTool binding uses load or supported resume; no replacement session |

## Packaging Command

Packaging is not part of normal repository validation. Run it only when
explicitly requested:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build
```

Do not provide signing credentials or invoke `codesign`/`notarytool` unless the
request is a release operation. A successful web build is not evidence that
packaged child processes or platform binaries can execute.

## Verification Record

On 2026-08-29, the requested macOS arm64 packaging check completed with
`CSC_IDENTITY_AUTO_DISCOVERY=false`. The generated DMG and app bundle contained
the unpacked `mcp-process` relay, both official ACP adapter entrypoints, the
Claude Agent SDK arm64 binary, and the Codex arm64 launcher/resources. The
check did not contact a real Claude or Codex account, so authenticated Agent
startup and live MCP calls remain part of integration testing.

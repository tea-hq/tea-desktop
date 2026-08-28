# ACP Agent Artifacts

Tea Desktop consumes official ACP implementations as pinned application
artifacts. Electron main is the ACP Client. The Claude and Codex packages run
as separate ACP Agent processes and are never imported as product runtimes in
the renderer.

| Role             | Package                                 | Version  | Published integrity      |
| ---------------- | --------------------------------------- | -------- | ------------------------ |
| ACP Client SDK   | `@agentclientprotocol/sdk`              | `1.4.0`  | `sha512-/euf...PVThg==`  |
| Claude ACP Agent | `@agentclientprotocol/claude-agent-acp` | `0.70.0` | `sha512-Psqj...VIV9aQ==` |
| Codex ACP Agent  | `@agentclientprotocol/codex-acp`        | `1.7.0`  | `sha512-+nUh...OTaaw==`  |
| MCP SDK          | `@modelcontextprotocol/sdk`             | `1.30.0` | `sha512-xKd8...eITA==`   |

The full integrity values live in `package-lock.json` and
`electron/conversation/acp/dependencyVersions.ts` so packaging checks can
compare exact values without truncation.

## Launch Rules

- Resolve the package-owned `dist/index.js` from the installed package root.
- Verify package name and exact version before launch.
- Start the entrypoint with an explicit executable and argument array.
- Never invoke a shell, `npx`, npm, pnpm, or a network installer at runtime.
- Include package licenses and the lockfile dependency closure in packaged
  application notices.
- Treat artifact mismatch as `artifactInvalid`; do not fall back to an
  unverified executable or a user-installed Agent.

The packaged artifact manifest will add target-specific digests during the
release slice. It must not contain credentials, environment values, user paths,
or protocol transcripts.

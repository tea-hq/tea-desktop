# Tea Local Plugin Protocol V1

## Status And Scope

This document defines the first version of the local native Plugin contract for
Tea Desktop. It is product-neutral and contains no Tauri, Vue, Tea Agent session,
Tenant, Workspace, or provider-specific types.

V1 covers manifest identity, bounded framing, lifecycle requests, terminal
responses, and a standalone conformance runner. Package installation and the
Desktop process host are implemented by later host layers against this contract.

The canonical manifest schema is
[`schemas/local-plugin-manifest-v1.schema.json`](./schemas/local-plugin-manifest-v1.schema.json).
Rust code must additionally enforce semantic uniqueness, SemVer parsing,
self-contained valid Action schemas, and safe package paths that JSON Schema
cannot completely express.

## Trust Boundary

A Plugin is user-installed native code. Installing and enabling it trusts it as
a local application. The Desktop child-process boundary isolates lifecycle and
crashes; it is not a sandbox and does not enforce the Plugin's network targets.

Desktop must launch the exact declared executable without a shell. A Plugin
cannot declare arbitrary launch arguments, environment interpolation, Vue code,
prompts, Skills, MCP servers, or dynamic tool URLs.

## Manifest

`plugin.json` is UTF-8 JSON with a maximum encoded size of 256 KiB. Unknown
fields are rejected at every typed object boundary.

```json
{
  "protocolVersion": "1.0.0",
  "id": "im.netease.tea.overmind",
  "version": "1.0.0",
  "displayName": "Overmind",
  "description": "Access personal Overmind work items.",
  "publisher": {
    "id": "im.netease.tea",
    "displayName": "Tea"
  },
  "entrypoints": {
    "macosArm64": "bin/macos-arm64/tea-overmind-plugin"
  },
  "credentials": [
    {
      "id": "clientSecret",
      "label": "Client secret",
      "secret": true,
      "required": true
    }
  ],
  "actions": [
    {
      "id": "task.query",
      "version": "1.0.0",
      "description": "Query personal work items.",
      "effect": "read",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false
      },
      "outputSchema": {
        "type": "object",
        "additionalProperties": false
      }
    }
  ]
}
```

### Identity And Versions

- `protocolVersion` is exactly `1.0.0` for this contract.
- Plugin and publisher IDs are lowercase reverse-domain identifiers, at most
  128 bytes.
- Plugin and Action versions are complete semantic versions.
- Action IDs contain at least two lowercase dot-separated segments and may use
  underscores inside segments.
- Credential field IDs begin with an ASCII letter and contain ASCII letters or
  digits, at most 64 bytes.
- IDs are stable facts and are never localized.

### Entry Points

Supported manifest keys are `macosArm64`, `macosX64`, `windowsX64`, and
`linuxX64`. At least one is required. Each path:

- is relative and begins `bin/<platform>/`;
- contains only normal path components;
- contains no parent/root/prefix component, backslash, NUL, or control character;
- is at most 512 bytes.

Package installation later verifies that the selected entry exists, belongs to
the package generation, matches the recorded digest, and is executable.

### Credential Fields

At most 32 credential fields are declared. Fields contain presentation and
validation metadata only. Values are entered through Desktop, stored by the
host credential provider, and delivered only over the private Plugin process
protocol for a host-selected Connection.

`secret` controls safe input presentation; it is not permission metadata.
Plugin diagnostics and errors must never contain credential values.

### Actions

At most 64 Actions are declared. Action IDs must be unique within one Plugin
generation. Each input/output schema:

- is a Draft 2020-12 JSON Schema with an object root;
- is at most 64 KiB and depth 16;
- contains no external `$ref`; local fragment references are allowed;
- compiles without network or filesystem retrieval.

`effect` is `read` or `write`. It is descriptive metadata in V1. Both effects
are callable when the Plugin and selected Connection are enabled.

## Process Framing

Each frame is an unsigned 32-bit big-endian byte length followed by exactly one
UTF-8 JSON object. The maximum JSON payload is 256 KiB. A receiver rejects an
oversized declared length before allocating its payload and rejects truncated,
trailing, malformed UTF-8/JSON, and unknown typed fields.

Desktop writes requests to Plugin stdin and reads responses from Plugin stdout.
Plugin stderr is not a protocol channel and must never contain credentials,
Action inputs, provider payloads, or other sensitive values.

## Requests

Every request carries `protocolVersion`, a host-generated `requestId`, and one
tagged method:

```text
initialize
test_connection
invoke
cancel
shutdown
```

Initialize:

```json
{
  "method": "initialize",
  "protocolVersion": "1.0.0",
  "requestId": "request-1",
  "hostVersion": "2.10.3"
}
```

Test Connection:

```json
{
  "method": "testConnection",
  "protocolVersion": "1.0.0",
  "requestId": "request-2",
  "credentials": { "clientId": "user", "clientSecret": "secret" }
}
```

Invoke:

```json
{
  "method": "invoke",
  "protocolVersion": "1.0.0",
  "requestId": "request-3",
  "invocationId": "invocation-1",
  "actionId": "task.query",
  "actionVersion": "1.0.0",
  "input": { "query": "open" },
  "credentials": { "clientId": "user", "clientSecret": "secret" }
}
```

Cancel and shutdown contain the common fields plus `invocationId` for cancel.
Request and invocation IDs are opaque, trimmed, control-free strings of at most
128 bytes. Public Action input is an object of at most 64 KiB/depth 8.
Credentials are an object of at most 16 KiB/depth 4. The host selects the
Connection and injects credentials; they are not part of the model-visible
Action schema or arguments.

## Responses

Every response carries `protocolVersion`, the correlated `requestId`, and a
tagged `outcome`. Initialize confirms the runtime Plugin identity/version:

```json
{
  "protocolVersion": "1.0.0",
  "requestId": "request-1",
  "outcome": {
    "status": "initialized",
    "pluginId": "im.netease.tea.overmind",
    "pluginVersion": "1.0.0"
  }
}
```

Invocation terminal outcomes are `succeeded`, `failed`, `unknown`, and
`cancelled`. `unknown` means the Plugin cannot safely assert the provider-side
effect outcome; the host must not project it as success.

```json
{
  "protocolVersion": "1.0.0",
  "requestId": "request-3",
  "outcome": {
    "status": "failed",
    "invocationId": "invocation-1",
    "code": "provider_unavailable",
    "retryable": true,
    "message": "provider is temporarily unavailable"
  }
}
```

Success output is an object of at most 64 KiB/depth 8. Error codes are lowercase
ASCII identifiers of at most 64 bytes. Optional safe messages are trimmed,
control-free, and at most 2 KiB. Protocol error types and `Debug` implementations
redact credential envelopes and invocation contents.

## Errors

Manifest APIs expose stable codes and generic messages:

| Code                 | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `invalidManifest`    | JSON, identifiers, fields, paths, versions, schemas, or uniqueness are invalid. |
| `manifestTooLarge`   | Encoded manifest exceeds 256 KiB.                                               |
| `unsupportedVersion` | A valid protocol version is not supported by this host.                         |
| `invalidMessage`     | A lifecycle message violates its typed fields or bounds.                        |
| `invalidFrame`       | A frame is truncated, trailing, or invalid JSON.                                |
| `frameTooLarge`      | A frame declares or encodes more than 256 KiB.                                  |
| `endOfStream`        | The stream ended cleanly before another frame.                                  |
| `io`                 | The local process stream failed.                                                |

Errors do not echo Plugin payloads, schema fragments, credential field values,
or provider responses.

## Conformance Runner

Third-party implementers can validate an unpacked manifest and exact executable
without launching Tea Desktop:

```bash
cargo run --manifest-path src-tauri/crates/plugin-protocol/Cargo.toml \
  --bin tea-plugin-conformance -- \
  ./plugin.json --executable ./bin/macos-arm64/example-plugin
```

The runner launches the executable directly without a shell and checks
initialize identity/version, Test Connection response semantics, one Action
whose input schema accepts an empty object, cancellation response semantics,
shutdown, timeout, framing bounds, and credential-safe diagnostics. It sends
synthetic conformance credentials. A typed `failed` response to Test Connection
or Invoke is protocol-compliant because no live provider credentials are
required; successful Action output is validated against its declared schema.

The command emits a stable JSON report and exits non-zero when incompatible.
Reports contain only check names, status, stable failure codes, and manifest
identity/version. Plugin stdout payloads, stderr content, credentials, and
provider diagnostics are never copied into the report. The child is terminated
and reaped on timeout or any protocol failure.

## Compatibility

Desktop rejects unsupported protocol versions before launching a Plugin.
Plugin versions identify packages; Action versions identify their semantic
input/output contracts. A Plugin upgrade that removes or incompatibly changes a
referenced Action leaves dependent Agent Roles unavailable until explicitly
edited. Desktop does not silently drop an Action or rewrite a Role.

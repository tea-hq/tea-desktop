import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ElectronCatalogService } from "./catalog";
import { ElectronPluginProcessService } from "./plugins";

describe("ElectronPluginProcessService", () => {
  const services: ElectronPluginProcessService[] = [];

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.shutdown()));
  });

  it("speaks the bounded v1 plugin protocol and keeps credentials in the main process", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tea-plugin-"));
    const executable = path.join(directory, "plugin.mjs");
    await writeFile(
      executable,
      `#!/usr/bin/env node
let pending = Buffer.alloc(0)
const send = value => {
  const payload = Buffer.from(JSON.stringify(value))
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, 4)
  process.stdout.write(frame)
}
process.stdin.on('data', chunk => {
  pending = Buffer.concat([pending, chunk])
  while (pending.length >= 4) {
    const length = pending.readUInt32BE(0)
    if (pending.length < length + 4) break
    const request = JSON.parse(pending.subarray(4, length + 4).toString())
    pending = pending.subarray(length + 4)
    if (request.method === 'initialize') send({ protocolVersion: '1.0.0', requestId: request.requestId, outcome: { status: 'initialized', pluginId: 'im.test.plugin', pluginVersion: '1.0.0' } })
    if (request.method === 'invoke') send({ protocolVersion: '1.0.0', requestId: request.requestId, outcome: { status: 'succeeded', invocationId: request.invocationId, output: { input: request.input, credential: request.credentials } } })
    if (request.method === 'shutdown') { send({ protocolVersion: '1.0.0', requestId: request.requestId, outcome: { status: 'shutdown' } }); process.exit(0) }
  }
})
`,
      { encoding: "utf8", mode: 0o700 },
    );
    await chmod(executable, 0o700);
    const catalogPath = path.join(directory, "catalog.json");
    await writeFile(
      catalogPath,
      JSON.stringify({
        schemaVersion: 1,
        data: {
          plugins: [{
            id: "im.test.plugin",
            version: "1.0.0",
            displayName: "Test plugin",
            enabled: true,
            executable,
            actions: [{ id: "echo", version: "1.0.0", description: "Echo", effect: "read" }],
            connections: [{ id: "default", displayName: "Default", enabled: true }],
          }],
          skills: [],
          roles: [],
        },
      }),
    );
    const catalog = new ElectronCatalogService(catalogPath);
    await catalog.initialize();
    const credentials = {
      readValue: async () => ({ token: "main-only" }),
    } as never;
    const service = new ElectronPluginProcessService(catalog, credentials);
    services.push(service);

    await expect(service.invoke({
      pluginId: "im.test.plugin",
      connectionId: "default",
      actionId: "echo",
      input: { message: "hello" },
    })).resolves.toEqual({
      input: { message: "hello" },
      credential: { token: "main-only" },
    });
  });

  it("rejects invocation when the plugin has no executable instead of claiming success", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tea-plugin-unavailable-"));
    const catalogPath = path.join(directory, "catalog.json");
    await writeFile(catalogPath, JSON.stringify({
      schemaVersion: 1,
      data: {
        plugins: [{
          id: "im.test.plugin",
          version: "1.0.0",
          displayName: "Test plugin",
          enabled: true,
          actions: [{ id: "echo", version: "1.0.0", description: "Echo", effect: "read" }],
          connections: [{ id: "default", displayName: "Default", enabled: true }],
        }],
        skills: [],
        roles: [],
      },
    }));
    const catalog = new ElectronCatalogService(catalogPath);
    await catalog.initialize();
    const service = new ElectronPluginProcessService(catalog, { readValue: async () => ({}) } as never);
    services.push(service);

    await expect(service.invoke({
      pluginId: "im.test.plugin",
      connectionId: "default",
      actionId: "echo",
      input: {},
    })).rejects.toMatchObject({ code: "runtimeUnavailable" });
  });
});

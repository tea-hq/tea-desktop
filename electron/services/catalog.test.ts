import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ElectronCatalogService } from "./catalog";

describe("ElectronCatalogService", () => {
  it("preserves the complete plugin action dependency binding", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tea-catalog-"));
    const service = new ElectronCatalogService(path.join(directory, "catalog.json"));
    await service.initialize();

    await service.saveAgentRoleRevision({
      roleId: "role.writer",
      revision: 0,
      name: "Writer",
      description: "",
      runtimeId: "external.claude",
      prompt: "Write clearly",
      dependencies: [{
        kind: "pluginAction",
        pluginId: "im.example.tasks",
        connectionId: "work",
        actionId: "task.query",
        version: "1.2.0",
      }],
    });

    expect(service.listAgentRoleRevisions()[0]?.dependencies).toEqual([{
      kind: "pluginAction",
      pluginId: "im.example.tasks",
      connectionId: "work",
      actionId: "task.query",
      version: "1.2.0",
    }]);
  });

  it("syncs remote roles using currentRevision runtime and scope validation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tea-catalog-remote-"));
    const auth = {
      listAgentRoles: vi.fn().mockResolvedValue({
        roles: [{
          roleId: "role.writer",
          tenantId: "tenant-a",
          ownerSubjectId: "subject-a",
          name: "Writer",
          description: "Writes clearly",
          visibility: "tenant",
          status: "published",
          currentRevision: {
            revision: 4,
            runtimeId: "external.codex",
            dependencies: [{
              kind: "pluginAction",
              pluginId: "im.example.tasks",
              connectionId: "work",
              actionId: "task.query",
              version: "1.2.0",
            }],
            capabilities: [],
          },
        }],
      }),
    };
    const service = new ElectronCatalogService(
      path.join(directory, "catalog.json"),
      auth,
    );
    await service.initialize();

    await expect(service.syncAgentRoles({ tenantId: "tenant-a", subjectId: "subject-a" })).resolves.toMatchObject({
      status: "ready",
      roles: [{
        roleId: "role.writer",
        currentRevision: {
          runtimeId: "external.codex",
          dependencies: [{ actionId: "task.query", connectionId: "work" }],
        },
      }],
    });
    expect(auth.listAgentRoles).toHaveBeenCalledOnce();
  });
});

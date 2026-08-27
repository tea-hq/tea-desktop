import { JsonStore } from "./jsonStore";

import type { PluginRecord } from "../../src/features/plugins/contracts";
import type { SkillRecord } from "../../src/features/skills/contracts";
import type {
  AgentRoleDependency,
  AgentRoleRecord,
} from "../../src/features/agent-roles/contracts";
import type { ElectronCenterAuthService } from "./centerAuth";

interface CatalogFile {
  plugins: PluginRecord[];
  skills: SkillRecord[];
  roles: AgentRoleRecord[];
  roleCache?: {
    tenantId: string;
    subjectId: string;
    state: {
      status: "ready" | "stale";
      roles: Array<Record<string, unknown>>;
      errorCode?: string;
    };
  };
}

export interface AgentRoleRevisionInput {
  roleId: string;
  revision: number;
  name: string;
  description: string;
  runtimeId: string;
  modelId?: string;
  prompt: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  visibility?: string;
  status?: string;
  capabilities?: Array<Record<string, unknown>>;
  dependencies: Array<Record<string, string>>;
}

const DEFAULT_CATALOG: CatalogFile = { plugins: [], skills: [], roles: [] };

export class ElectronCatalogService {
  private readonly store: JsonStore<CatalogFile>;
  private state: CatalogFile = structuredClone(DEFAULT_CATALOG);

  constructor(
    filePath: string,
    private readonly centerAuth?: Pick<ElectronCenterAuthService, "listAgentRoles">,
  ) {
    this.store = new JsonStore(filePath, {
      schemaVersion: 1,
      maxBytes: 8 * 1024 * 1024,
    });
  }

  async initialize(): Promise<void> {
    this.state = await this.store.load(DEFAULT_CATALOG);
  }

  listPlugins(): PluginRecord[] {
    return structuredClone(this.state.plugins);
  }

  getPlugin(pluginId: string): PluginRecord | undefined {
    const plugin = this.state.plugins.find((value) => value.id === pluginId);
    return plugin ? structuredClone(plugin) : undefined;
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.state.plugins.find((value) => value.id === pluginId);
    if (!plugin)
      throw serviceError(
        "invalidRequest",
        false,
        `unknown plugin: ${pluginId}`,
      );
    plugin.enabled = enabled;
    await this.persist();
  }

  listSkills(): SkillRecord[] {
    return structuredClone(this.state.skills);
  }

  listAgentRoles(): AgentRoleRecord[] {
    return structuredClone(this.state.roles);
  }

  listAgentRoleRevisions(): Array<Record<string, unknown>> {
    return this.state.roles.map((role) => ({
      roleId: role.id,
      revision: role.revision,
      name: role.name,
      description: role.description,
      runtimeId: role.runtimeId,
      ...(role.modelId ? { modelId: role.modelId } : {}),
      prompt: role.systemPrompt ?? "",
      systemPrompt: role.systemPrompt,
      userPromptTemplate: role.userPromptTemplate,
      dependencies: role.dependencies ?? role.skills.map((id) => ({
        kind: "skill",
        id,
        version: "0.0.0",
      })),
      capabilities: role.capabilities ?? [],
    }));
  }

  async saveAgentRoleRevision(
    input: AgentRoleRevisionInput,
  ): Promise<AgentRoleRecord> {
    const role = normalizeRole(input);
    const current = this.state.roles.findIndex((value) => value.id === role.id);
    if (current === -1) this.state.roles.push(role);
    else this.state.roles[current] = role;
    await this.persist();
    return structuredClone(role);
  }

  getAgentRoleCache(): {
    status: "ready" | "stale";
    roles: Array<Record<string, unknown>>;
    errorCode?: string;
  } {
    return this.state.roleCache?.state ?? { status: "ready", roles: this.toRemoteRoleRecords() };
  }

  async syncAgentRoles(request: {
    tenantId: string;
    subjectId: string;
  }): Promise<{
    status: "ready" | "stale" | "error";
    roles: Array<Record<string, unknown>>;
    errorCode?: string;
  }> {
    if (!request.tenantId.trim() || !request.subjectId.trim())
      throw serviceError("invalidRequest", false, "agent role scope is invalid");
    if (!this.centerAuth) return this.getAgentRoleCache();
    try {
      const payload = await this.centerAuth.listAgentRoles();
      const roles = parseRemoteRoleResponse(payload, request.tenantId);
      const state = { status: "ready" as const, roles };
      this.state.roleCache = { ...request, state };
      await this.persist();
      return state;
    } catch (error) {
      const previous = this.state.roleCache;
      if (previous?.tenantId === request.tenantId && previous.subjectId === request.subjectId) {
        const state = {
          status: "stale" as const,
          roles: previous.state.roles,
          errorCode: errorCode(error),
        };
        this.state.roleCache = { ...request, state };
        await this.persist();
      }
      throw error;
    }
  }

  private toRemoteRoleRecords(): Array<Record<string, unknown>> {
    return this.state.roles.map((role) => ({
      roleId: role.id,
      tenantId: "local",
      ownerSubjectId: "local",
      name: role.name,
      description: role.description,
      runtimeId: role.runtimeId,
      visibility: role.visibility,
      status: role.status,
      currentRevision: {
        revision: role.revision,
        runtimeId: role.runtimeId,
        modelId: role.modelId,
        systemPrompt: role.systemPrompt,
        userPromptTemplate: role.userPromptTemplate,
        capabilities: role.capabilities ?? [],
        dependencies: role.dependencies ?? role.skills.map((id) => ({
          kind: "skill",
          id,
          version: "0.0.0",
        })),
      },
    }));
  }

  private async persist(): Promise<void> {
    await this.store.save(this.state);
  }
}

function normalizeRole(input: AgentRoleRevisionInput): AgentRoleRecord {
  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(input.roleId) ||
    !input.name.trim() ||
    !input.runtimeId.trim()
  ) {
    throw serviceError(
      "invalidRequest",
      false,
      "agent role revision is invalid",
    );
  }
  const capabilities = (input.capabilities ?? []).map((value) =>
    normalizeCapability(value),
  );
  const dependencies = input.dependencies.map((value) => {
    if (value.kind === "skill" && value.id)
      return {
        kind: "skill",
        id: value.id,
        version: value.version || "0.0.0",
      };
    if (
      value.kind === "pluginAction" &&
      value.pluginId &&
      value.connectionId &&
      value.actionId
    )
      return {
        kind: "pluginAction",
        pluginId: value.pluginId,
        connectionId: value.connectionId,
        actionId: value.actionId,
        version: value.version || "0.0.0",
      };
    throw serviceError(
      "invalidRequest",
      false,
      "agent role dependency is incomplete",
    );
  });
  return {
    id: input.roleId,
    name: input.name.trim().slice(0, 128),
    description: input.description.trim().slice(0, 1024),
    runtimeId: input.runtimeId.trim(),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    systemPrompt: input.systemPrompt ?? input.prompt,
    userPromptTemplate: input.userPromptTemplate,
    visibility: validVisibility(input.visibility)
      ? input.visibility
      : "private",
    status: validStatus(input.status) ? input.status : "draft",
    capabilities,
    dependencies: dependencies as AgentRoleDependency[],
    skills: dependencies
      .filter((value) => value.kind === "skill" && value.id)
      .map((value) => value.id!),
    plugins: dependencies
      .filter((value) => value.kind === "pluginAction" && value.pluginId)
      .map((value) => value.pluginId!),
    revision:
      Number.isInteger(input.revision) && input.revision >= 0
        ? input.revision + 1
        : 1,
    enabled: true,
  };
}

function parseRemoteRoleResponse(
  value: unknown,
  tenantId: string,
): Array<Record<string, unknown>> {
  if (!isRecord(value) || !Array.isArray(value.roles))
    throw serviceError("protocolFailure", false, "agent role response is invalid");
  return value.roles.map((role) => {
    if (!isRecord(role) || role.tenantId !== tenantId || !isRecord(role.currentRevision))
      throw serviceError("protocolFailure", false, "agent role response has an invalid scope");
    const revision = role.currentRevision;
    const runtimeId = readNonEmptyString(revision.runtimeId, "runtimeId");
    const dependencies = Array.isArray(revision.dependencies)
      ? revision.dependencies.map((dependency) => normalizeDependency(dependency))
      : [];
    return {
      roleId: readNonEmptyString(role.roleId, "roleId"),
      tenantId,
      ownerSubjectId: readNonEmptyString(role.ownerSubjectId, "ownerSubjectId"),
      name: readNonEmptyString(role.name, "name"),
      description: typeof role.description === "string" ? role.description : "",
      runtimeId,
      visibility: role.visibility,
      status: role.status,
      currentRevision: {
        revision: readNonNegativeInteger(revision.revision, "revision"),
        runtimeId,
        modelId: typeof revision.modelId === "string" ? revision.modelId : undefined,
        systemPrompt: typeof revision.systemPrompt === "string" ? revision.systemPrompt : undefined,
        userPromptTemplate: typeof revision.userPromptTemplate === "string" ? revision.userPromptTemplate : undefined,
        capabilities: Array.isArray(revision.capabilities)
          ? revision.capabilities.map((capability) => normalizeCapability(capability))
          : [],
        dependencies,
      },
    };
  });
}

function normalizeDependency(value: unknown): AgentRoleDependency {
  if (!isRecord(value) || typeof value.kind !== "string")
    throw serviceError("protocolFailure", false, "agent role dependency is invalid");
  if (value.kind === "skill" && typeof value.id === "string" && value.id.trim())
    return { kind: "skill", id: value.id, version: readVersion(value.version) };
  if (
    value.kind === "pluginAction" &&
    typeof value.pluginId === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.actionId === "string" &&
    value.pluginId.trim() &&
    value.connectionId.trim() &&
    value.actionId.trim()
  )
    return {
      kind: "pluginAction",
      pluginId: value.pluginId,
      connectionId: value.connectionId,
      actionId: value.actionId,
      version: readVersion(value.version),
    };
  throw serviceError("protocolFailure", false, "agent role dependency is invalid");
}

function readVersion(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "0.0.0";
}

function readNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw serviceError("protocolFailure", false, `agent role ${name} is invalid`);
  return value;
}

function readNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw serviceError("protocolFailure", false, `agent role ${name} is invalid`);
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : "centerUnavailable";
}

function normalizeCapability(
  value: unknown,
): NonNullable<AgentRoleRecord["capabilities"]>[number] {
  if (!isRecord(value))
    throw serviceError("invalidRequest", false, "agent role capability is unsupported");
  const kind = value.kind;
  const id = value.id;
  if (
    (kind === "skill" || kind === "mcp" || kind === "tool") &&
    typeof id === "string" &&
    id.trim()
  ) {
    return {
      kind,
      id: id.trim(),
      version: typeof value.version === "string" ? value.version : "0.0.0",
    };
  }
  if (
    kind === "pluginAction" &&
    typeof value.pluginId === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.actionId === "string"
  ) {
    return {
      kind,
      id: `${value.pluginId}/${value.connectionId}/${value.actionId}`,
      version: typeof value.version === "string" ? value.version : "0.0.0",
    };
  }
  throw serviceError(
    "invalidRequest",
    false,
    "agent role capability is unsupported",
  );
}

function validVisibility(
  value: string | undefined,
): value is "tenant" | "restricted" | "private" {
  return value === "tenant" || value === "restricted" || value === "private";
}

function validStatus(
  value: string | undefined,
): value is "draft" | "published" | "archived" {
  return value === "draft" || value === "published" || value === "archived";
}

function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) };
}

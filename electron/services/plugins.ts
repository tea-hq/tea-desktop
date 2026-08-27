import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

import type { PluginRecord } from "../../src/features/plugins/contracts";
import { ElectronCatalogService } from "./catalog";
import { ElectronCredentialService } from "./credentials";

const PLUGIN_PROTOCOL_VERSION = "1.0.0";
const HOST_VERSION = "1.0.0";
const MAX_FRAME_BYTES = 256 * 1024;
const OPERATION_TIMEOUT_MS = 30_000;

export interface PluginInvocationRequest {
  pluginId: string;
  connectionId: string;
  actionId: string;
  input: Record<string, unknown>;
}

export class ElectronPluginProcessService {
  private readonly processes = new Map<string, PluginProcess>();
  private readonly starting = new Map<string, Promise<PluginProcess>>();

  constructor(
    private readonly catalog: ElectronCatalogService,
    private readonly credentials: ElectronCredentialService,
  ) {}

  async invoke(request: PluginInvocationRequest): Promise<unknown> {
    const plugin = this.requirePlugin(request.pluginId);
    const connection = plugin.connections.find(
      (value) => value.id === request.connectionId,
    );
    if (!connection || !connection.enabled)
      throw serviceError(
        "runtimeUnavailable",
        false,
        "plugin connection is unavailable",
      );
    const action = plugin.actions.find((value) => value.id === request.actionId);
    if (!action)
      throw serviceError("invalidRequest", false, "plugin action is unknown");
    const credentialValue = await this.credentials.readValue(
      request.pluginId,
      request.connectionId,
    );
    if (!credentialValue)
      throw serviceError(
        "runtimeUnavailable",
        false,
        "plugin connection credentials are unavailable",
      );

    let process: PluginProcess | undefined;
    try {
      process = await this.getProcess(plugin);
      return await process.invoke(
        action.id,
        action.version,
        request.input,
        credentialValue,
      );
    } catch (error) {
      if (this.processes.get(plugin.id) === process) this.processes.delete(plugin.id);
      await process?.dispose();
      throw error;
    }
  }

  async disable(pluginId: string): Promise<void> {
    await this.starting.get(pluginId)?.catch(() => undefined);
    const process = this.processes.get(pluginId);
    this.processes.delete(pluginId);
    await process?.dispose();
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.starting.values()].map((startup) => startup.catch(() => undefined)));
    const processes = [...this.processes.values()];
    this.processes.clear();
    await Promise.all(processes.map((process) => process.dispose()));
  }

  private requirePlugin(pluginId: string): PluginRecord {
    const plugin = this.catalog.getPlugin(pluginId);
    if (!plugin || !plugin.enabled)
      throw serviceError("runtimeUnavailable", false, "plugin is unavailable");
    return plugin;
  }

  private async getProcess(plugin: PluginRecord): Promise<PluginProcess> {
    const current = this.processes.get(plugin.id);
    if (current?.isRunning()) return current;
    await current?.dispose();
    let startup = this.starting.get(plugin.id);
    if (!startup) {
      startup = PluginProcess.start(plugin).then((process) => {
        this.processes.set(plugin.id, process);
        return process;
      });
      this.starting.set(plugin.id, startup);
      void startup.then(
        () => undefined,
        () => undefined,
      ).then(() => {
        if (this.starting.get(plugin.id) === startup) this.starting.delete(plugin.id);
      });
    }
    return startup;
  }
}

class PluginProcess {
  private readonly stdoutIterator: AsyncIterator<Buffer>;
  private readonly closed: Promise<void>;
  private frameBuffer = Buffer.alloc(0);
  private disposed = false;
  private disposePromise: Promise<void> | null = null;
  private sequence = 0;
  private operation: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly plugin: PluginRecord,
  ) {
    this.stdoutIterator = child.stdout[Symbol.asyncIterator]();
    this.closed = new Promise((resolve) => {
      child.once("close", () => resolve());
      child.once("error", () => resolve());
    });
    child.stderr.on("data", () => undefined);
  }

  static async start(plugin: PluginRecord): Promise<PluginProcess> {
    const executable = resolveExecutable(plugin);
    const child = spawn(executable, [], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: isolatedPluginEnvironment() as NodeJS.ProcessEnv,
    });
    const process = new PluginProcess(child, plugin);
    try {
      const response = await process.exchange({
        method: "initialize",
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        requestId: process.nextId("initialize"),
        hostVersion: HOST_VERSION,
      });
      const outcome = response.outcome;
      if (
        outcome.status !== "initialized" ||
        outcome.pluginId !== plugin.id ||
        outcome.pluginVersion !== plugin.version
      )
        throw serviceError(
          "runtimeUnavailable",
          false,
          "plugin identity or version did not match its catalog entry",
        );
      return process;
    } catch (error) {
      await process.dispose();
      throw error;
    }
  }

  isRunning(): boolean {
    return !this.disposed && this.child.exitCode === null && !this.child.killed;
  }

  invoke(
    actionId: string,
    actionVersion: string,
    input: Record<string, unknown>,
    credentials: Record<string, unknown>,
  ): Promise<unknown> {
    return this.enqueue(async () => {
      const requestId = this.nextId("invoke");
      const invocationId = this.nextId("invocation");
      const response = await this.exchange({
        method: "invoke",
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        requestId,
        invocationId,
        actionId,
        actionVersion,
        input,
        credentials,
      });
      const outcome = response.outcome;
      if (
        outcome.status === "succeeded" &&
        outcome.invocationId === invocationId &&
        isRecord(outcome.output)
      )
        return outcome.output;
      if (outcome.status === "failed" && outcome.invocationId === invocationId)
        throw serviceError(
          "pluginActionFailed",
          outcome.retryable === true,
          "plugin action execution failed",
        );
      if (outcome.status === "cancelled" && outcome.invocationId === invocationId)
        throw serviceError("cancelled", false, "plugin action was cancelled");
      throw serviceError("protocolFailure", false, "plugin action response was invalid");
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    if (!this.disposePromise) {
      this.disposePromise = this.disposeNow();
    }
    await this.disposePromise;
  }

  private async disposeNow(): Promise<void> {
    try {
      const requestId = this.nextId("shutdown");
      await this.exchange({
        method: "shutdown",
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        requestId,
      });
    } catch {
      // A crashed or unresponsive plugin is terminated below.
    }
    if (this.child.exitCode === null) this.child.kill();
    await Promise.race([this.closed, timeout(OPERATION_TIMEOUT_MS)]);
    this.disposed = true;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async exchange(request: Record<string, unknown>): Promise<PluginResponse> {
    if (!this.isRunning()) throw serviceError("runtimeUnavailable", true, "plugin process is not running");
    const payload = Buffer.from(JSON.stringify(request), "utf8");
    if (payload.length > MAX_FRAME_BYTES)
      throw serviceError("limitExceeded", false, "plugin protocol frame is too large");
    await withTimeout(writeFrame(this.child, payload), "write plugin protocol frame");
    const responsePayload = await withTimeout(
      this.readFrame(),
      "read plugin protocol frame",
    );
    const response = parseResponse(responsePayload);
    if (response.requestId !== request.requestId)
      throw serviceError("protocolFailure", false, "plugin response id did not match request");
    return response;
  }

  private async readFrame(): Promise<Buffer> {
    const header = await this.readBytes(4);
    const length = header.readUInt32BE(0);
    if (length > MAX_FRAME_BYTES)
      throw serviceError("limitExceeded", false, "plugin protocol frame is too large");
    return this.readBytes(length);
  }

  private async readBytes(length: number): Promise<Buffer> {
    while (this.frameBuffer.length < length) {
      const next = await this.stdoutIterator.next();
      if (next.done) throw serviceError("runtimeUnavailable", true, "plugin process closed its output");
      this.frameBuffer = Buffer.concat([this.frameBuffer, Buffer.from(next.value)]);
    }
    const value = this.frameBuffer.subarray(0, length);
    this.frameBuffer = this.frameBuffer.subarray(length);
    return value;
  }

  private nextId(prefix: string): string {
    return `plugin-${prefix}-${this.sequence++}`;
  }
}

interface PluginResponse {
  protocolVersion: string;
  requestId: string;
  outcome: Record<string, unknown>;
}

function parseResponse(payload: Buffer): PluginResponse {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString("utf8"));
  } catch {
    throw serviceError("protocolFailure", false, "plugin response is not valid JSON");
  }
  if (
    !isRecord(value) ||
    value.protocolVersion !== PLUGIN_PROTOCOL_VERSION ||
    typeof value.requestId !== "string" ||
    !isRecord(value.outcome) ||
    typeof value.outcome.status !== "string"
  )
    throw serviceError("protocolFailure", false, "plugin response is invalid");
  return value as unknown as PluginResponse;
}

function writeFrame(
  child: ChildProcessWithoutNullStreams,
  payload: Buffer,
): Promise<void> {
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return new Promise((resolve, reject) => {
    child.stdin.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}

async function withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(serviceError("timeout", true, `${operation} timed out`)),
      OPERATION_TIMEOUT_MS,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function timeout(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resolveExecutable(plugin: PluginRecord): string {
  if (typeof plugin.executable !== "string" || !path.isAbsolute(plugin.executable))
    throw serviceError("runtimeUnavailable", false, "plugin executable is not configured");
  return plugin.executable;
}

function isolatedPluginEnvironment(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? process.env.TMP ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) };
}

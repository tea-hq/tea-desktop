import type {
  ManagedModelProviderState,
  ManagedWorkspaceState,
} from "../../src/features/managed-runtime/contracts";
import type { ElectronCenterAuthService } from "./centerAuth";

export interface ManagedImCredentials {
  appKey: string;
  account: string;
  token: string;
}

export type ManagedWorkspaceStateEmitter = (
  state: ManagedWorkspaceState,
) => void;

export class ElectronManagedWorkspaceService {
  private state: ManagedWorkspaceState = {
    generation: 0,
    phase: "inactive",
    modelProviders: [],
  };
  private imCredentials: ManagedImCredentials | null = null;

  constructor(
    private readonly auth: ElectronCenterAuthService,
    private readonly emitState: ManagedWorkspaceStateEmitter,
  ) {}

  stateValue(): ManagedWorkspaceState {
    return structuredClone(this.state);
  }

  async refresh(): Promise<ManagedWorkspaceState> {
    const auth = this.auth.stateValue();
    if (
      !auth.bootstrap ||
      (auth.phase !== "authenticated" && auth.phase !== "offlineCached")
    ) {
      this.imCredentials = null;
      this.setState({
        phase: "inactive",
        tenantId: undefined,
        userId: undefined,
        im: undefined,
        modelProviders: [],
      });
      return this.stateValue();
    }
    this.setState({
      phase: "preparing",
      tenantId: auth.bootstrap.tenant.id,
      userId: auth.bootstrap.user.id,
      errorCode: undefined,
    });
    try {
      const configuration =
        (await this.auth.runtimeConfiguration()) as RuntimeConfiguration;
      const providers =
        configuration.modelProviders.map<ManagedModelProviderState>(
          (value) => ({
            id: value.id,
            kind: value.kind,
            displayName: value.displayName,
            status: value.status,
            ...(value.errorCode ? { errorCode: value.errorCode } : {}),
            models: value.models.map((model) => ({
              id: model.id,
              displayName: model.displayName,
              selectionValue: `${value.id}/${model.id}`,
            })),
          }),
        );
      this.imCredentials =
        configuration.im?.status === "ready" &&
        configuration.im.appKey &&
        configuration.im.account &&
        configuration.im.token
          ? {
              appKey: configuration.im.appKey,
              account: configuration.im.account,
              token: configuration.im.token,
            }
          : null;
      this.setState({
        phase:
          this.imCredentials ||
          providers.some((provider) => provider.status === "ready")
            ? "ready"
            : "degraded",
        im: configuration.im
          ? {
              status: configuration.im.status,
              ...(configuration.im.errorCode
                ? { errorCode: configuration.im.errorCode }
                : {}),
            }
          : undefined,
        modelProviders: providers,
      });
      return this.stateValue();
    } catch (error) {
      this.imCredentials = null;
      const code = errorCode(error);
      this.setState({
        phase: code === "centerUnavailable" ? "offline" : "failed",
        errorCode: code,
      });
      throw error;
    }
  }

  getImCredentials(): ManagedImCredentials {
    if (!this.imCredentials || this.state.im?.status !== "ready")
      throw serviceError("imRuntimeUnavailable", false);
    return structuredClone(this.imCredentials);
  }

  private setState(update: Partial<ManagedWorkspaceState>): void {
    this.state = {
      ...this.state,
      ...update,
      generation: this.state.generation + 1,
    };
    this.emitState(this.stateValue());
  }
}

interface RuntimeConfiguration {
  schemaVersion: number;
  revision: number;
  im: {
    status: "ready" | "disabled" | "unavailable";
    errorCode?: string;
    provider: string;
    appKey: string;
    account: string;
    token: string;
  } | null;
  modelProviders: Array<{
    status: "ready" | "disabled" | "unavailable";
    errorCode?: string;
    id: string;
    kind: string;
    displayName: string;
    baseUrl: string;
    apiKey: string;
    models: Array<{ id: string; displayName: string }>;
  }>;
}

function errorCode(error: unknown): string {
  const value = error as { code?: unknown } | null;
  return typeof value?.code === "string" ? value.code : "runtimeUnavailable";
}

function serviceError(
  code: string,
  retryable: boolean,
): { code: string; retryable: boolean } {
  return { code, retryable };
}

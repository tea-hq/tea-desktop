import type { AcpRunnerAgent } from './acp.js'

/**
 * Agents shipped with the Runner package. Keep runtime ids aligned with the
 * desktop ACP catalog so a cloud command can be executed without per-machine
 * runner configuration.
 */
export const DEFAULT_ACP_RUNNER_AGENTS = [
  {
    runtimeId: 'external.claude',
    executable: 'claude-agent-acp',
    modelConfigId: 'model',
    modeConfigId: 'mode',
  },
  {
    runtimeId: 'external.codex',
    executable: 'codex-acp',
    modelConfigId: 'model',
    modeConfigId: 'mode',
  },
] as const satisfies readonly AcpRunnerAgent[]

export function defaultAcpRunnerAgents(): AcpRunnerAgent[] {
  return DEFAULT_ACP_RUNNER_AGENTS.map((agent) => ({ ...agent }))
}

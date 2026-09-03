import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../packages/runner/src/protocol'

export const RUNNER_INSTALL_TOOLS = ['npx', 'curl', 'powershell', 'homebrew', 'chocolatey'] as const

export type RunnerInstallTool = (typeof RUNNER_INSTALL_TOOLS)[number]

export interface RunnerRegistrationCommandOption {
  tool: RunnerInstallTool
  command: string
  preview: boolean
}

export function createRunnerRegistrationCommandOptions(
  registration: RunnerRegistrationCommand,
  token: RunnerTokenView,
): RunnerRegistrationCommandOption[] {
  const npx: RunnerRegistrationCommandOption = {
    tool: 'npx',
    command: registration.command,
    preview: false,
  }
  if (registration.tokenId !== token.tokenId || !token.secret) return [npx]

  const centerUrl = registration.centerUrl.replace(/\/$/, '')
  const posixArguments = registrationArguments(posixQuote(centerUrl), posixQuote(token.secret))
  const powershellArguments = registrationArguments(
    powershellQuote(centerUrl),
    powershellQuote(token.secret),
  )

  return [
    npx,
    {
      tool: 'curl',
      command: `curl -fsSL ${posixQuote(`${centerUrl}/v1/cloud/runner-install.sh`)} | sh -s -- ${posixArguments}`,
      preview: true,
    },
    {
      tool: 'powershell',
      command: `& ([scriptblock]::Create((Invoke-RestMethod ${powershellQuote(`${centerUrl}/v1/cloud/runner-install.ps1`)}))) ${powershellArguments}`,
      preview: true,
    },
    {
      tool: 'homebrew',
      command: `brew install tea/runner/tea-runner && tea-runner ${posixArguments}`,
      preview: true,
    },
    {
      tool: 'chocolatey',
      command: `choco install tea-runner --yes; tea-runner ${powershellArguments}`,
      preview: true,
    },
  ]
}

function registrationArguments(centerUrl: string, token: string): string {
  return `register --center-url ${centerUrl} --token ${token} --install-service`
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

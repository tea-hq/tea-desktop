import { describe, expect, it } from 'vitest'

import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../packages/runner/src/protocol'
import { createRunnerRegistrationCommandOptions } from './runnerRegistrationCommands'

const registration: RunnerRegistrationCommand = {
  tokenId: 'tenant-token',
  scope: 'tenant',
  scopeId: 'tenant-1',
  centerUrl: 'https://center.test/',
  command:
    "npx --yes @tea/runner register --center-url 'https://center.test' --token 'tenant-secret' --install-service",
}
const token: RunnerTokenView = {
  tokenId: 'tenant-token',
  scope: 'tenant',
  scopeId: 'tenant-1',
  secret: 'tenant-secret',
  createdAt: '2026-09-01T00:00:00Z',
}

describe('createRunnerRegistrationCommandOptions', () => {
  it('keeps the authoritative npx command and projects preview installers', () => {
    const options = createRunnerRegistrationCommandOptions(registration, token)

    expect(options.map((option) => option.tool)).toEqual([
      'npx',
      'curl',
      'powershell',
      'homebrew',
      'chocolatey',
    ])
    expect(options[0]).toEqual({ tool: 'npx', command: registration.command, preview: false })
    expect(options[1]?.command).toContain(
      "curl -fsSL 'https://center.test/v1/cloud/runner-install.sh'",
    )
    expect(options[2]?.command).toContain(
      "Invoke-RestMethod 'https://center.test/v1/cloud/runner-install.ps1'",
    )
    expect(options[3]?.command).toContain('brew install tea/runner/tea-runner')
    expect(options[4]?.command).toContain('choco install tea-runner --yes')
    expect(options.slice(1).every((option) => option.preview)).toBe(true)
    expect(options.every((option) => option.command.includes("--token 'tenant-secret'"))).toBe(true)
  })

  it('does not project commands from a missing or mismatched token secret', () => {
    expect(
      createRunnerRegistrationCommandOptions(registration, {
        ...token,
        tokenId: 'other-token',
        secret: undefined,
      }),
    ).toEqual([{ tool: 'npx', command: registration.command, preview: false }])
  })

  it('uses shell-specific escaping for preview commands', () => {
    const options = createRunnerRegistrationCommandOptions(registration, {
      ...token,
      secret: "runner's-secret",
    })

    expect(options.find((option) => option.tool === 'curl')?.command).toContain(
      "--token 'runner'\"'\"'s-secret'",
    )
    expect(options.find((option) => option.tool === 'powershell')?.command).toContain(
      "--token 'runner''s-secret'",
    )
  })
})

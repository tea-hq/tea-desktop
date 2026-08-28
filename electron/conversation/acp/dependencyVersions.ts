export const ACP_DEPENDENCIES = {
  sdk: {
    packageName: '@agentclientprotocol/sdk',
    version: '1.4.0',
    integrity:
      'sha512-/eufudw+aFY1LKLolT6yFE6UMmYRl7fMJ/DEONSIyR6wI3slHWITBsANRGqXEY8FRzqUxwh7QEaGiZHcJPVThg==',
  },
  claudeAgent: {
    packageName: '@agentclientprotocol/claude-agent-acp',
    version: '0.70.0',
    integrity:
      'sha512-Psqj6fhV4pQ8IM480zpJ+xGiMMIqNLxlsTj5Mzn+T8KSURCVNJdl0ktcqLMjgHJC/QnOvDdDkFf3xTW9VIV9aQ==',
  },
  codexAgent: {
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.7.0',
    integrity:
      'sha512-+nUhAJyunx8Zc7r3jjLPoMPPUkkk02TmBIosln4l+ugRNUOdNQAMm6toZo7xb+mF1yM5zxJB83qvy/bPmOTaaw==',
  },
  mcpSdk: {
    packageName: '@modelcontextprotocol/sdk',
    version: '1.30.0',
    integrity:
      'sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==',
  },
} as const

export type AcpDependency = (typeof ACP_DEPENDENCIES)[keyof typeof ACP_DEPENDENCIES]

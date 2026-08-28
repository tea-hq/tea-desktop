export type AcpHostErrorCode =
  | 'artifactInvalid'
  | 'artifactMissing'
  | 'connectionFailed'
  | 'initializationTimeout'
  | 'processStartFailed'
  | 'protocolLineTooLong'
  | 'protocolVersionUnsupported'
  | 'shutDown'

export class AcpHostError extends Error {
  constructor(
    readonly code: AcpHostErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AcpHostError'
  }
}

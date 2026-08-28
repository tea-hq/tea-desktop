import type { ConversationToolScope } from '../toolBroker'
import { AcpMcpAttachment, type AcpMcpAttachmentOptions } from './mcpAttachment'
import {
  AcpMcpEntrypointResolver,
  createAcpMcpServerConfiguration,
  type AcpMcpEntrypointResolverOptions,
  type AcpMcpServerConfiguration,
} from './mcpEntrypoint'

export interface AcpMcpAttachmentOwner {
  readonly ready: Promise<void>
  readonly closed: Promise<void>
  close(): Promise<void>
}

export interface AcpMcpAttachmentBinding {
  readonly attachment: AcpMcpAttachmentOwner
  readonly configuration: AcpMcpServerConfiguration
}

export interface AcpMcpAttachmentFactoryPort {
  create(scope: ConversationToolScope, wireVersion: 1 | 2): Promise<AcpMcpAttachmentBinding>
}

export interface AcpMcpAttachmentFactoryOptions {
  entrypoint?: AcpMcpEntrypointResolverOptions
  attachment?: AcpMcpAttachmentOptions
}

export class AcpMcpAttachmentFactory implements AcpMcpAttachmentFactoryPort {
  private readonly entrypointResolver: AcpMcpEntrypointResolver
  private readonly attachmentOptions: AcpMcpAttachmentOptions

  constructor(options: AcpMcpAttachmentFactoryOptions = {}) {
    this.entrypointResolver = new AcpMcpEntrypointResolver(options.entrypoint)
    this.attachmentOptions = { ...options.attachment }
  }

  async create(scope: ConversationToolScope, wireVersion: 1 | 2): Promise<AcpMcpAttachmentBinding> {
    const entrypoint = await this.entrypointResolver.resolve()
    const attachment = await AcpMcpAttachment.create(scope, this.attachmentOptions)
    try {
      return {
        attachment,
        configuration: createAcpMcpServerConfiguration(
          wireVersion,
          entrypoint,
          attachment.credentialPath,
        ),
      }
    } catch (cause) {
      await attachment.close().catch(() => undefined)
      throw cause
    }
  }
}

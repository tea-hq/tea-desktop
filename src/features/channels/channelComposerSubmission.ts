import type {
  ChannelAttachment,
  MessageMention,
  MessageRef,
  OutgoingMessageContent,
} from './contracts'

export interface ChannelComposerSubmission {
  text: string
  replyTo?: MessageRef
  attachments: ChannelAttachment[]
  mentions: MessageMention[]
}

export interface PreparedChannelComposerDelivery {
  content: OutgoingMessageContent
  replyTo?: MessageRef
  mentions?: MessageMention[]
}

/** Produces provider-neutral deliveries while binding reply context exactly once. */
export function prepareChannelComposerSubmission(
  submission: ChannelComposerSubmission,
): PreparedChannelComposerDelivery[] {
  const deliveries: PreparedChannelComposerDelivery[] = []
  let replyTo = submission.replyTo
  if (submission.text) {
    deliveries.push({
      content: { kind: 'text', text: submission.text },
      ...(replyTo ? { replyTo } : {}),
      ...(submission.mentions.length ? { mentions: submission.mentions } : {}),
    })
    replyTo = undefined
  }
  for (const attachment of submission.attachments) {
    deliveries.push({
      content: {
        kind: attachment.kind,
        media: {
          source: { kind: 'localFile', token: attachment.token },
          name: attachment.name,
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
        },
      },
      ...(replyTo ? { replyTo } : {}),
    })
    replyTo = undefined
  }
  return deliveries
}

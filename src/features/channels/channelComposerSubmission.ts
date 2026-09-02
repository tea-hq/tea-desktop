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

export interface ChannelComposerSender {
  sendText(text: string, replyTo?: MessageRef, mentions?: MessageMention[]): Promise<unknown>
  sendContent(content: OutgoingMessageContent, replyTo?: MessageRef): Promise<unknown>
}

/** Starts every delivery attempt before the caller clears controlled composer state. */
export function beginChannelComposerSubmission(
  sender: ChannelComposerSender,
  submission: ChannelComposerSubmission,
): Promise<unknown>[] {
  const sends: Promise<unknown>[] = []
  let replyTo = submission.replyTo
  if (submission.text) {
    sends.push(sender.sendText(submission.text, replyTo, submission.mentions))
    replyTo = undefined
  }
  for (const attachment of submission.attachments) {
    sends.push(
      sender.sendContent(
        {
          kind: attachment.kind,
          media: {
            source: { kind: 'localFile', token: attachment.token },
            name: attachment.name,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          },
        },
        replyTo,
      ),
    )
    replyTo = undefined
  }
  return sends
}

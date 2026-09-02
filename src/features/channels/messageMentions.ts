import type { MessageMention, MessageMentionTarget } from './contracts'

export interface SelectedMessageMention {
  target: MessageMentionTarget
  label: string
}

export function collectMessageMentions(
  text: string,
  selected: SelectedMessageMention[],
): MessageMention[] {
  const unique = new Map<string, SelectedMessageMention>()
  for (const value of selected) {
    const label = value.label.trim()
    if (!label || label.length > 201) continue
    unique.set(mentionTargetKey(value.target), { target: value.target, label })
  }

  const mentions: MessageMention[] = []
  for (const value of unique.values()) {
    const ranges = []
    let offset = text.indexOf(value.label)
    while (offset >= 0 && ranges.length < 100) {
      ranges.push({ start: offset, end: offset + value.label.length })
      offset = text.indexOf(value.label, offset + value.label.length)
    }
    if (ranges.length) mentions.push({ ...value, ranges })
  }
  return mentions
}

function mentionTargetKey(target: MessageMentionTarget): string {
  return target.kind === 'channel' ? 'channel' : `user:${target.accountId}`
}

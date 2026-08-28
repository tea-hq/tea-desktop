export type ChannelAvatarTone = 'tone-0' | 'tone-1' | 'tone-2' | 'tone-3'

export function channelAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length > 1)
    return parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join('')
      .toLocaleUpperCase()
  return Array.from(parts[0]).slice(0, 2).join('').toLocaleUpperCase()
}

export function channelAvatarTone(channelRef: string): ChannelAvatarTone {
  let hash = 0
  for (const character of channelRef) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return `tone-${Math.abs(hash) % 4}` as ChannelAvatarTone
}

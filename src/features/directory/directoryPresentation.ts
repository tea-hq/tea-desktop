import type { DirectoryUser } from './contracts'

export function directoryUserInitials(name: string): string {
  const value = name.trim()
  if (!value) return '?'
  const words = value.split(/\s+/)
  return (
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
      : value.slice(0, 2)
  ).toLocaleUpperCase()
}

export function isDirectoryMessagingReady(user: DirectoryUser): boolean {
  return user.im?.status === 'ready' && Boolean(user.im.account)
}

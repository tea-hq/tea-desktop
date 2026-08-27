import type { EndpointBootstrap } from '@/features/auth/contracts'
import type { ChannelSelfProfile } from '@/features/channels/contracts'

export type CenterSelfProfile = EndpointBootstrap['user']
export type ProfilePhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'unavailable'
export type ProfileAlignment = 'unknown' | 'aligned' | 'mismatched'
export type ProfileComparisonField = 'displayName' | 'email' | 'avatarUrl'
export type ProfileComparisonStatus = 'aligned' | 'mismatched' | 'notAvailable'

export interface ProfileComparison {
  field: ProfileComparisonField
  centerValue?: string
  channelValue?: string
  status: ProfileComparisonStatus
}

export function copyCenterSelfProfile(value: CenterSelfProfile): CenterSelfProfile {
  return {
    id: value.id,
    displayName: value.displayName,
    preferredUsername: value.preferredUsername,
    email: value.email,
    emailVerified: value.emailVerified,
    avatarUrl: value.avatarUrl,
    oidcSubject: value.oidcSubject,
  }
}

export function compareSelfProfiles(
  center: CenterSelfProfile | null,
  channel: ChannelSelfProfile | null,
): ProfileComparison[] {
  if (!center) return []
  return [
    compareField('displayName', center.displayName, channel?.name),
    compareField('email', center.email, channel?.email),
    compareField('avatarUrl', center.avatarUrl, channel?.avatarUrl),
  ]
}

export function summarizeAlignment(comparisons: ProfileComparison[]): ProfileAlignment {
  if (comparisons.length === 0 || comparisons.every(value => value.status === 'notAvailable')) return 'unknown'
  return comparisons.some(value => value.status === 'mismatched') ? 'mismatched' : 'aligned'
}

function compareField(
  field: ProfileComparisonField,
  centerValue: string | undefined,
  channelValue: string | undefined,
): ProfileComparison {
  const center = optionalValue(centerValue)
  const channel = optionalValue(channelValue)
  if (!center && !channel) return { field, status: 'notAvailable' }
  const left = field === 'email' ? center?.toLocaleLowerCase('en') : center
  const right = field === 'email' ? channel?.toLocaleLowerCase('en') : channel
  return {
    field,
    ...(center ? { centerValue: center } : {}),
    ...(channel ? { channelValue: channel } : {}),
    status: left === right ? 'aligned' : 'mismatched',
  }
}

function optionalValue(value: string | undefined): string | undefined {
  const candidate = value?.trim()
  return candidate ? candidate : undefined
}

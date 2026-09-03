import { Avatar, Style } from '@dicebear/core'
import avataaarsDefinition from '@dicebear/styles/avataaars.json' with { type: 'json' }

const avatarStyle = new Style(avataaarsDefinition)
const avatarCache = new Map<string, string>()
const maximumCachedAvatars = 256
const backgroundPalette = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#e0e7ff', '#cffafe']
const defaultSkinColor = '#f8d25c'
const defaultHairColor = '#2c1b18'

export interface DefaultAvatarOptions {
  backgroundColor?: string
}

export function createDefaultAvatarDataUri(
  seed: string,
  options: DefaultAvatarOptions = {},
): string {
  const normalizedSeed = seed.trim() || 'tea:anonymous'
  const backgroundColor = options.backgroundColor?.trim() || stableBackground(normalizedSeed)
  const cacheKey = `${normalizedSeed}\0${backgroundColor}`
  const cached = avatarCache.get(cacheKey)
  if (cached) return cached

  const dataUri = new Avatar(avatarStyle, {
    seed: normalizedSeed,
    size: 128,
    backgroundColor,
    skinColor: [defaultSkinColor],
    hairColor: [defaultHairColor],
    accessoriesProbability: 0,
    facialHairProbability: 0,
    eyesVariant: ['default', 'happy', 'squint', 'surprised'],
    eyebrowsVariant: ['default', 'defaultNatural', 'raisedExcited', 'unibrowNatural'],
    mouthVariant: ['smile', 'twinkle', 'serious', 'default'],
  }).toDataUri()

  avatarCache.set(cacheKey, dataUri)
  if (avatarCache.size > maximumCachedAvatars) {
    const oldestKey = avatarCache.keys().next().value
    if (oldestKey) avatarCache.delete(oldestKey)
  }
  return dataUri
}

function stableBackground(seed: string): string {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return backgroundPalette[(hash >>> 0) % backgroundPalette.length]!
}

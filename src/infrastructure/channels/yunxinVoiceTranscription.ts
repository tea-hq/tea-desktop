import { ChannelTransportError } from '@/features/channels/contracts'

export const MAX_VOICE_TRANSCRIPT_LENGTH = 32_768

const MAX_VOICE_URL_LENGTH = 4_096
const MAX_VOICE_DURATION_MS = 86_400_000
const MAX_SCENE_NAME_LENGTH = 128

interface YunxinVoiceMessageSource {
  messageType?: number
  attachment?: unknown
}

export interface YunxinVoiceToTextParams {
  voiceUrl: string
  duration: number
  mimeType: 'aac'
  sampleRate: '16000'
  sceneName?: string
}

export function mapYunxinVoiceToTextParams(
  message: YunxinVoiceMessageSource,
): YunxinVoiceToTextParams {
  if (message.messageType !== 2) throw new ChannelTransportError('invalidRequest', false)
  const attachment = asRecord(message.attachment)
  const voiceUrl = boundedHttpsUrl(attachment?.url)
  const duration = attachment?.duration
  if (
    !voiceUrl ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_VOICE_DURATION_MS
  )
    throw new ChannelTransportError('invalidRequest', false)

  const sceneName = boundedOptionalText(attachment?.sceneName, MAX_SCENE_NAME_LENGTH)
  return {
    voiceUrl,
    duration,
    mimeType: 'aac',
    sampleRate: '16000',
    ...(sceneName ? { sceneName } : {}),
  }
}

export function normalizeYunxinVoiceTranscript(value: unknown): string {
  if (typeof value !== 'string') throw new ChannelTransportError('protocolFailure', false)
  const text = value.trim()
  if (!text || text.length > MAX_VOICE_TRANSCRIPT_LENGTH)
    throw new ChannelTransportError('protocolFailure', false)
  return text
}

function boundedHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text || text.length > MAX_VOICE_URL_LENGTH) return undefined
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && url.hostname ? text : undefined
  } catch {
    return undefined
  }
}

function boundedOptionalText(value: unknown, limit: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new ChannelTransportError('invalidRequest', false)
  const text = value.trim()
  if (!text || text.length > limit) throw new ChannelTransportError('invalidRequest', false)
  return text
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

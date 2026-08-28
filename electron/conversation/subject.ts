export const MAX_SUBJECT_SOURCE_CHARS = 4_000
export const MAX_SUBJECT_CHARS = 50
export const MAX_RAW_SUBJECT_OUTPUT_CHARS = 4_096

export function prepareSubjectSource(sourceText: string): string {
  return takeCharacters(sourceText.trim(), MAX_SUBJECT_SOURCE_CHARS)
}

export function buildSubjectPrompt(sourceText: string): string {
  const source = prepareSubjectSource(sourceText)
  return (
    'Create a short, specific subject for this coding conversation. ' +
    'Use the same language as the user. Prefer a noun phrase that describes the actual topic, ' +
    'not a sentence that repeats the request. Preserve important technical identifiers. ' +
    'Return only the subject, without quotes, Markdown, or ending punctuation. ' +
    'Use at most 20 Chinese characters or 8 words.\n\n' +
    `User message:\n${source}`
  )
}

export function normalizeSubject(value: string): string | null {
  const firstLine = value
    .split(/\r?\n/u)
    .find((line) => line.trim().length > 0)
    ?.trim()
  if (!firstLine) return null
  const unwrapped = firstLine
    .replace(/^["'`*#]+|["'`*#]+$/gu, '')
    .trim()
    .replace(/[.!?。！？:：]+$/gu, '')
    .trim()
  const normalized = takeCharacters(
    [...unwrapped].filter((character) => !/\p{Cc}/u.test(character)).join(''),
    MAX_SUBJECT_CHARS,
  )
  return normalized.length > 0 ? normalized : null
}

export function normalizeGeneratedSubject(sourceText: string, value: string): string | null {
  const subject = normalizeSubject(value)
  if (!subject || comparisonKey(sourceText) === comparisonKey(subject)) return null
  return subject
}

function comparisonKey(value: string): string {
  return [...value]
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .join('')
    .toLowerCase()
}

function takeCharacters(value: string, maximum: number): string {
  return [...value].slice(0, maximum).join('')
}

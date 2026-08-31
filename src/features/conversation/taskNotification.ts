export interface TaskNotification {
  taskId: string | null
  toolUseId: string | null
  outputFile: string | null
  status: string | null
  summary: string | null
  resultText: string
}

const TASK_NOTIFICATION_OPEN = /<\s*task-notification\s*>/i
const TASK_NOTIFICATION_CLOSE = /<\s*\/\s*task-notification\s*>/i
const RESULT_OPEN = /<\s*result\s*>/i

export function parseTaskNotification(text: string): TaskNotification | null {
  const normalized = decodeNotificationEntities(text.trimStart())
  const opening = TASK_NOTIFICATION_OPEN.exec(normalized)
  if (!opening || opening.index !== 0) return null

  const body = normalized.slice(opening[0].length)
  const resultOpening = RESULT_OPEN.exec(body)
  const header = body.slice(
    0,
    resultOpening?.index ?? TASK_NOTIFICATION_CLOSE.exec(body)?.index ?? body.length,
  )
  const parsed = {
    taskId: extractTagValue(header, 'task-id'),
    toolUseId: extractTagValue(header, 'tool-use-id'),
    outputFile: extractTagValue(header, 'output-file'),
    status: extractTagValue(header, 'status'),
    summary: extractTagValue(header, 'summary'),
  }

  if (resultOpening) {
    const resultText = normalizeResultText(
      body.slice(resultOpening.index + resultOpening[0].length),
    )
    if (!hasIdentifiableField(parsed) && !resultText) return null
    return { ...parsed, resultText }
  }

  if (!hasIdentifiableField(parsed)) return null
  return { ...parsed, resultText: '' }
}

function extractTagValue(text: string, tagName: NotificationTagName): string | null {
  const match = tagPattern(tagName).exec(text)
  const value = match?.[1]?.trim() ?? ''
  return value || null
}

function normalizeResultText(text: string): string {
  const lowerText = text.toLowerCase()
  const resultClose = lowerText.lastIndexOf('</result>')
  const taskClose = lowerText.lastIndexOf('</task-notification>')
  const end = resultClose >= 0 ? resultClose : taskClose >= 0 ? taskClose : text.length
  return text.slice(0, end).trim()
}

function hasIdentifiableField(value: Omit<TaskNotification, 'resultText'>): boolean {
  return Boolean(
    value.taskId || value.toolUseId || value.outputFile || value.status || value.summary,
  )
}

function decodeNotificationEntities(text: string): string {
  let decoded = text
  for (let index = 0; index < 3; index += 1) {
    const next = decoded
      .replace(/&lt;|&#60;|&#x3c;/gi, '<')
      .replace(/&gt;|&#62;|&#x3e;/gi, '>')
      .replace(/&amp;|&#38;|&#x26;/gi, '&')
    if (next === decoded) return decoded
    decoded = next
  }
  return decoded
}

type NotificationTagName = 'task-id' | 'tool-use-id' | 'output-file' | 'status' | 'summary'

function tagPattern(tagName: NotificationTagName): RegExp {
  switch (tagName) {
    case 'task-id':
      return /<\s*task-id\s*>\s*([\s\S]*?)\s*<\s*\/\s*task-id\s*>/i
    case 'tool-use-id':
      return /<\s*tool-use-id\s*>\s*([\s\S]*?)\s*<\s*\/\s*tool-use-id\s*>/i
    case 'output-file':
      return /<\s*output-file\s*>\s*([\s\S]*?)\s*<\s*\/\s*output-file\s*>/i
    case 'status':
      return /<\s*status\s*>\s*([\s\S]*?)\s*<\s*\/\s*status\s*>/i
    case 'summary':
      return /<\s*summary\s*>\s*([\s\S]*?)\s*<\s*\/\s*summary\s*>/i
  }
}

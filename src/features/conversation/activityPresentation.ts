import type { ToolCallBlock } from './contracts'

export type ActivityCategory =
  'thought' | 'read' | 'command' | 'search' | 'edit' | 'browser' | 'other'

export function classifyToolName(name: string): Exclude<ActivityCategory, 'thought'> {
  const value = name.toLowerCase()
  if (/(browser|web|url|page)/.test(value)) return 'browser'
  if (/(edit|write|patch|update|delete)/.test(value)) return 'edit'
  if (/(terminal|command|shell|exec|run|bash|zsh|powershell)/.test(value)) return 'command'
  if (/(search|find|grep|query|ripgrep)/.test(value) || /(^|[._-])rg($|[._-])/.test(value)) {
    return 'search'
  }
  if (/(read|file|workspace|path|list|ls)/.test(value)) return 'read'
  return 'other'
}

export function iconForActivity(category: ActivityCategory): string {
  if (category === 'thought') return 'i-mdi-lightbulb-outline'
  if (category === 'read') return 'i-mdi-file-document-outline'
  if (category === 'command') return 'i-mdi-console-line'
  if (category === 'search') return 'i-mdi-magnify'
  if (category === 'edit') return 'i-mdi-file-edit-outline'
  if (category === 'browser') return 'i-mdi-web'
  return 'i-mdi-wrench-outline'
}

export function iconForTool(name: string): string {
  return iconForActivity(classifyToolName(name))
}

export function compactActivityText(value: string): string {
  return value
    .replace(/```[a-zA-Z0-9_-]*\s*/g, '')
    .replace(/```/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function argumentRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function argumentText(value: unknown): string | undefined {
  if (typeof value === 'string') return compactActivityText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map(argumentText).filter((item): item is string => Boolean(item))
    return values.length ? values.join(', ') : undefined
  }
  return undefined
}

function argumentKeysForCategory(category: Exclude<ActivityCategory, 'thought'>): string[] {
  if (category === 'read') return ['path', 'filePath', 'file', 'filename', 'pattern']
  if (category === 'command') return ['command', 'cmd', 'script', 'shell']
  if (category === 'search') return ['pattern', 'query', 'search', 'path']
  if (category === 'edit') return ['path', 'filePath', 'file', 'filename']
  if (category === 'browser') return ['url', 'href', 'page']
  return ['path', 'filePath', 'file', 'name', 'query', 'command']
}

export function activityArgument(tool: ToolCallBlock): string | undefined {
  const direct = argumentText(tool.arguments)
  if (direct) return direct

  const record = argumentRecord(tool.arguments)
  if (!record) return undefined
  const category = classifyToolName(tool.name)
  const keys = argumentKeysForCategory(category)
  for (const [key, rawValue] of Object.entries(record)) {
    if (!keys.includes(key)) continue
    const value = argumentText(rawValue)
    if (value) return value
  }
  return undefined
}

export function activityDescription(tool: ToolCallBlock): {
  category: Exclude<ActivityCategory, 'thought'>
  subject?: string
  message?: string
} {
  const category = classifyToolName(tool.name)
  const message = tool.message?.trim() ? compactActivityText(tool.message) : undefined
  return { category, subject: activityArgument(tool), message }
}

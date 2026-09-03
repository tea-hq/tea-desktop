import { createHash } from 'node:crypto'
import path from 'node:path'

interface DevelopmentProfileOptions {
  appDataPath: string
  appRoot: string
  devServerUrl?: string
}

export function resolveDevelopmentUserDataPath(options: DevelopmentProfileOptions): string | null {
  if (!options.devServerUrl) return null

  const appRoot = path.resolve(options.appRoot)
  const checkoutName = path.basename(appRoot).replace(/[^a-zA-Z0-9._-]/g, '-') || 'checkout'
  const checkoutId = createHash('sha256').update(appRoot).digest('hex').slice(0, 12)
  return path.join(
    path.resolve(options.appDataPath),
    'Tea',
    'Development',
    `${checkoutName}-${checkoutId}`,
  )
}

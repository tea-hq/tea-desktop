export interface WorkspaceSession {
  initialize(isCurrent: () => boolean): Promise<void>
  dispose(): Promise<void>
}

export class WorkspaceLifecycle {
  private generation = 0
  private active: { key: string; session: WorkspaceSession } | null = null

  async enter(key: string, create: () => WorkspaceSession): Promise<void> {
    if (this.active?.key === key) return
    const generation = ++this.generation
    const previous = this.active
    this.active = null
    if (previous) await previous.session.dispose()
    if (generation !== this.generation) return

    const session = create()
    this.active = { key, session }
    const isCurrent = () => generation === this.generation && this.active?.session === session
    try {
      await session.initialize(isCurrent)
    } finally {
      if (!isCurrent()) await session.dispose()
    }
  }

  async exit(): Promise<void> {
    this.generation += 1
    const active = this.active
    this.active = null
    if (active) await active.session.dispose()
  }
}

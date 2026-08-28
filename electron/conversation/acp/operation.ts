export class AcpTurnOperation {
  readonly completed: Promise<void>
  private completeOperation!: () => void
  private terminal = false

  constructor(readonly id: number) {
    this.completed = new Promise((resolve) => {
      this.completeOperation = resolve
    })
  }

  complete(): boolean {
    if (this.terminal) return false
    this.terminal = true
    this.completeOperation()
    return true
  }
}

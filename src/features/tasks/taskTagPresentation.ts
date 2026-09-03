export function taskTagClass(index: number): string {
  switch (Math.max(0, Math.floor(index)) % 4) {
    case 1:
      return 'bg-warning-subtle text-warning'
    case 2:
      return 'bg-success-subtle text-success'
    case 3:
      return 'bg-danger-subtle text-danger'
    default:
      return 'bg-brand-accent/10 text-brand-accent'
  }
}

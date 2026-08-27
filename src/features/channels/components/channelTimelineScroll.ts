export interface TimelineScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight?: number
}

export interface TimelineScrollSnapshot {
  scrollHeight: number
  scrollTop: number
}

export function isTimelineNearBottom(
  metrics: Required<TimelineScrollMetrics>,
  threshold = 120,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

export function restorePrependScrollTop(
  snapshot: TimelineScrollSnapshot,
  nextScrollHeight: number,
): number {
  return Math.max(0, snapshot.scrollTop + nextScrollHeight - snapshot.scrollHeight)
}

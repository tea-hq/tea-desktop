import type { WebContents } from 'electron'

import type { DesktopEvent, DesktopEventPayloadMap } from '../../src/types/electronBridge'

export type DesktopEventTarget = Pick<WebContents, 'isDestroyed' | 'send'>

export class DesktopEventPublisher {
  constructor(private readonly target: () => DesktopEventTarget | null) {}

  publish<Event extends DesktopEvent>(event: Event, payload: DesktopEventPayloadMap[Event]): void {
    const target = this.target()
    if (!target || target.isDestroyed()) return
    target.send(`tea:event:${event}`, structuredClone(payload))
  }
}

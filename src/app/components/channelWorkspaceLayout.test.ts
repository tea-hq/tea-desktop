import { describe, expect, it } from 'vitest'

import { resolveChannelWorkspacePanel } from './channelWorkspaceLayout'

describe('resolveChannelWorkspacePanel', () => {
  it('shows the thread panel for an active channel with an open thread', () => {
    expect(
      resolveChannelWorkspacePanel({
        hasActiveChannel: true,
        hasThreadRoot: true,
        statusPhase: 'connected',
        channelCount: 1,
      }),
    ).toBe('thread')
  })

  it('does not add a panel beside the timeline when a channel is selected without a thread', () => {
    expect(
      resolveChannelWorkspacePanel({
        hasActiveChannel: true,
        hasThreadRoot: false,
        statusPhase: 'connected',
        channelCount: 1,
      }),
    ).toBe('none')
  })

  it('shows the selection placeholder only when no channel is selected', () => {
    expect(
      resolveChannelWorkspacePanel({
        hasActiveChannel: false,
        hasThreadRoot: false,
        statusPhase: 'connected',
        channelCount: 1,
      }),
    ).toBe('selection')
  })

  it('shows the connection panel for an unavailable or empty workspace without a channel', () => {
    expect(
      resolveChannelWorkspacePanel({
        hasActiveChannel: false,
        hasThreadRoot: false,
        statusPhase: 'connecting',
        channelCount: 1,
      }),
    ).toBe('connection')
    expect(
      resolveChannelWorkspacePanel({
        hasActiveChannel: false,
        hasThreadRoot: false,
        statusPhase: 'connected',
        channelCount: 0,
      }),
    ).toBe('connection')
  })
})

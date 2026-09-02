import { expect } from 'vitest'
import type { ChannelEvent, ChannelTransport } from '@/features/channels/contracts'

export async function verifyTransportContract(transport: ChannelTransport): Promise<void> {
  const events: ChannelEvent[] = []
  const unsubscribe = transport.subscribe((event) => events.push(event))
  await transport.connect()

  expect(transport.status()).toMatchObject({
    phase: 'connected',
    accountRef: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  const accountRef = transport.status().accountRef
  await transport.connect()
  expect(transport.status().accountRef).toBe(accountRef)
  expect(JSON.parse(JSON.stringify(transport.descriptor()))).toEqual(transport.descriptor())
  const profileCapability = transport.capabilities().find((value) => value.id === 'profile.self')
  if (profileCapability?.available) {
    const profile = await transport.getSelfProfile()
    expect(profile.accountId).toBeTruthy()
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile)
    const profiles = await transport.getUserProfiles([profile.accountId])
    expect(profiles).toEqual([profile])
  }
  const channels = await transport.listChannels({ offset: 0, limit: 2 })
  expect(channels.items.length).toBeGreaterThan(0)
  const channelRef = channels.items[0]!.ref
  const page = await transport.loadMessages({ channelRef, direction: 'before', limit: 20 })
  expect(page.channelRef).toBe(channelRef)
  expect(page.items).toEqual([...page.items].sort((left, right) => left.sentAt - right.sentAt))
  await transport.markRead(channelRef)

  const request = {
    channelRef,
    content: { kind: 'text' as const, text: 'contract message' },
    idempotencyKey: 'contract-key',
  }
  const first = await transport.sendMessage(request)
  const duplicate = await transport.sendMessage(request)
  expect(duplicate).toEqual(first)
  const confirmed = events
    .filter((event) => event.type === 'message.upserted')
    .flatMap((event) => event.messages)
    .find((message) => message.clientReference === request.idempotencyKey)
  expect(confirmed?.ref).toEqual(first.ref)
  expect(events.some((event) => event.type === 'status.changed')).toBe(true)
  expect(events.every((event) => Number.isInteger(event.sequence))).toBe(true)

  unsubscribe()
  await transport.disconnect()
  await expect(transport.listChannels({ offset: 0, limit: 1 })).rejects.toMatchObject({
    code: 'notConnected',
  })
  await transport.dispose()
  await transport.dispose()
  await expect(transport.connect()).rejects.toMatchObject({ code: 'disposed' })
}

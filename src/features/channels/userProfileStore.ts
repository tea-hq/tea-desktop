import { defineStore } from 'pinia'
import { shallowReactive, shallowRef } from 'vue'

import type { ChannelUserProfile, ChannelUserProfileClient } from './contracts'

export interface ChannelUserProfileCache {
  readonly profiles: ReadonlyMap<string, ChannelUserProfile>
  getProfile(accountId: string): ChannelUserProfile | null
  upsertProfile(profile: ChannelUserProfile): void
  ensureProfiles(accountIds: string[]): Promise<void>
  clear(): void
}

const maximumAccountIds = 100

export const useChannelUserProfileStore = defineStore('channelUserProfiles', () => {
  const profiles = shallowReactive(new Map<string, ChannelUserProfile>())
  const transport = shallowRef<ChannelUserProfileClient | null>(null)
  const inFlight = new Map<string, Promise<void>>()
  let generation = 0

  function configure(value: ChannelUserProfileClient): void {
    if (transport.value === value) return
    generation += 1
    transport.value = value
    profiles.clear()
    inFlight.clear()
  }

  function getProfile(accountId: string): ChannelUserProfile | null {
    const key = normalizeAccountId(accountId)
    const profile = key ? profiles.get(key) : undefined
    return profile ? structuredClone(profile) : null
  }

  function upsertProfile(profile: ChannelUserProfile): void {
    const accountId = normalizeAccountId(profile.accountId)
    if (!accountId) return
    profiles.set(accountId, structuredClone({ ...profile, accountId }))
  }

  async function ensureProfiles(accountIds: string[]): Promise<void> {
    const configured = transport.value
    if (!configured) return
    const ids = uniqueAccountIds(accountIds)
    if (ids.length === 0) return
    const missing = ids.filter((id) => !profiles.has(id) && !inFlight.has(id))
    if (missing.length > 0) {
      const requestGeneration = generation
      for (const batch of chunk(missing, maximumAccountIds)) {
        const request = configured.getUserProfiles(batch).then((values) => {
          if (requestGeneration !== generation || configured !== transport.value) return
          for (const profile of values) upsertProfile(profile)
        })
        for (const id of batch) inFlight.set(id, request)
        void request
          .then(
            () => undefined,
            () => undefined,
          )
          .then(() => {
            for (const id of batch) {
              if (inFlight.get(id) === request) inFlight.delete(id)
            }
          })
      }
    }

    await Promise.all(ids.map((id) => inFlight.get(id))).then(() => undefined)
  }

  function clear(): void {
    generation += 1
    profiles.clear()
    inFlight.clear()
  }

  return { profiles, configure, getProfile, upsertProfile, ensureProfiles, clear }
})

function normalizeAccountId(value: string): string {
  return value.trim()
}

function uniqueAccountIds(values: string[]): string[] {
  return [...new Set(values.map(normalizeAccountId).filter(Boolean))]
}

function chunk<T>(values: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size)
    batches.push(values.slice(index, index + size))
  return batches
}

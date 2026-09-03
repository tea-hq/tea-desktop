import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { DirectoryClient, DirectoryPhase, DirectoryUser } from './contracts'

export const useDirectoryStore = defineStore('directory', () => {
  const users = ref<DirectoryUser[]>([])
  const phase = ref<DirectoryPhase>('idle')
  const errorKey = ref<string | null>(null)
  const query = ref('')
  const client = shallowRef<DirectoryClient | null>(null)
  let generation = 0

  const filteredUsers = computed(() => {
    const value = query.value.trim().toLocaleLowerCase()
    if (!value) return users.value
    return users.value.filter((user) =>
      [
        user.center.displayName,
        user.center.userId,
        user.oidc.preferredUsername,
        user.oidc.email,
        user.im?.account,
      ].some((part) => part?.toLocaleLowerCase().includes(value)),
    )
  })

  function configure(value: DirectoryClient): void {
    generation += 1
    client.value = value
    users.value = []
    phase.value = 'idle'
    errorKey.value = null
  }
  async function refresh(forceRefresh = false): Promise<void> {
    const configured = client.value
    const operation = ++generation
    if (!configured) {
      phase.value = 'unavailable'
      errorKey.value = 'directory.errors.unavailable'
      return
    }
    phase.value = 'loading'
    errorKey.value = null
    try {
      const result = await configured.listUsers(forceRefresh ? { forceRefresh: true } : undefined)
      if (operation !== generation || configured !== client.value) return
      users.value = structuredClone(result.users)
      phase.value = 'ready'
    } catch (error) {
      if (operation !== generation || configured !== client.value) return
      phase.value = users.value.length ? 'stale' : 'error'
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : ''
      errorKey.value =
        code === 'recoveryRequired'
          ? 'directory.errors.signInAgain'
          : code === 'centerUnavailable'
            ? 'directory.errors.unavailable'
            : code === 'protocolFailure'
              ? 'directory.errors.unsupported'
              : 'directory.errors.loadFailed'
    }
  }
  function dispose(): void {
    generation += 1
    client.value = null
    users.value = []
    phase.value = 'idle'
    errorKey.value = null
    query.value = ''
  }
  return { users, filteredUsers, phase, errorKey, query, configure, refresh, dispose }
})

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDefaultAvatarDataUri } from '@/shared/avatar/defaultAvatar'
import { TeaAvatar, TeaButton, TeaEmptyState, TeaMessageBar } from '@/shared/ui'
import type { DirectoryUser } from '../contracts'
import type { ChannelUserProfile } from '@/features/channels/contracts'
import { directoryUserInitials, isDirectoryMessagingReady } from '../directoryPresentation'

const props = defineProps<{
  user: DirectoryUser | null
  actionError?: string | null
  userProfiles?: ReadonlyMap<string, ChannelUserProfile>
}>()

const emit = defineEmits<{
  message: [user: DirectoryUser]
}>()

const { t } = useI18n()

const messagingReady = computed(() => Boolean(props.user && isDirectoryMessagingReady(props.user)))
const userProfile = computed(() => {
  const account = props.user?.im?.account
  return account ? (props.userProfiles?.get(account) ?? null) : null
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-canvas" data-testid="directory-detail">
    <header class="shrink-0 border-b border-line-soft px-6 py-5">
      <h2 class="text-base font-semibold text-fg">{{ t('directory.memberDetails') }}</h2>
    </header>

    <TeaEmptyState
      v-if="!user"
      class="flex-1"
      :title="t('directory.noMemberSelected')"
      icon="i-mdi-account-outline"
    />

    <template v-else>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="flex flex-col items-center px-6 pb-7 pt-8 text-center">
          <TeaAvatar
            size="large"
            :src="userProfile?.avatarUrl || user.oidc.avatarUrl"
            :fallback-src="
              user.im?.account ? createDefaultAvatarDataUri(`tea:account:${user.im.account}`) : ''
            "
            :fallback-text="directoryUserInitials(user.center.displayName)"
            fallback-class="bg-inverse text-on-inverse"
          />
          <h3 class="mt-4 max-w-full truncate text-xl font-semibold text-fg">
            {{ user.center.displayName }}
          </h3>
          <p class="mt-1 max-w-full truncate text-sm text-subtle">
            {{ user.oidc.preferredUsername || user.center.userId }}
          </p>
          <span class="mt-4 inline-flex items-center gap-2 text-xs font-medium text-dim">
            <span
              class="size-1.5 rounded-full"
              :class="messagingReady ? 'bg-success' : 'bg-disabled'"
              aria-hidden="true"
            />
            {{
              messagingReady ? t('directory.messagingReady') : t('directory.messagingUnavailable')
            }}
          </span>
        </div>

        <dl class="border-t border-line-soft px-6">
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.email') }}</dt>
            <dd class="mt-1 break-words text-sm text-fg">
              {{ user.oidc.email || t('directory.notProvided') }}
            </dd>
          </div>
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.account') }}</dt>
            <dd class="mt-1 break-words font-mono text-sm text-fg">
              {{ user.im?.account || t('directory.accountUnavailable') }}
            </dd>
          </div>
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.provider') }}</dt>
            <dd class="mt-1 break-words text-sm text-fg">
              {{ user.im?.provider || t('directory.notProvided') }}
            </dd>
          </div>
        </dl>

        <div v-if="actionError" class="px-6 pt-5">
          <TeaMessageBar tone="error">{{ t(actionError) }}</TeaMessageBar>
        </div>
      </div>

      <footer class="shrink-0 border-t border-line bg-canvas p-5">
        <TeaButton
          appearance="primary"
          fluid
          :disabled="!messagingReady"
          data-testid="directory-message"
          @click="emit('message', user)"
        >
          <span class="i-mdi-message-text-outline size-4" aria-hidden="true" />
          {{ t('directory.sendMessage') }}
        </TeaButton>
      </footer>
    </template>
  </section>
</template>

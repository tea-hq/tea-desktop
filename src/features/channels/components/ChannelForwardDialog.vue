<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SegmentedChoice, TeaButton, TeaCheckbox, TeaDialog, TeaTextarea } from '@/shared/ui'
import type { Channel, ForwardMessageMode, Message } from '../contracts'
import { FORWARD_TARGET_LIMIT, forwardMessageEligibility } from '../messageForwarding'

const props = withDefaults(
  defineProps<{
    open: boolean
    messages: Message[]
    channels: Channel[]
    initialMode?: ForwardMessageMode
    pending?: boolean
  }>(),
  { initialMode: 'individual', pending: false },
)
const emit = defineEmits<{
  close: []
  confirm: [payload: { channelRefs: string[]; mode: ForwardMessageMode; comment?: string }]
}>()
const { t } = useI18n()
const selected = ref<string[]>([])
const mode = ref<ForwardMessageMode>('individual')
const comment = ref('')
const availableChannels = computed(() => props.channels.filter((channel) => channel.ref))
const individualEligibility = computed(() =>
  forwardMessageEligibility(props.messages, 'individual'),
)
const mergedEligibility = computed(() => forwardMessageEligibility(props.messages, 'merged'))
const modeEligibility = computed(() =>
  mode.value === 'individual' ? individualEligibility.value : mergedEligibility.value,
)
const modeOptions = computed(() => [
  {
    value: 'individual',
    label: t('channels.selection.individual'),
    disabled: !individualEligibility.value.eligible,
  },
  {
    value: 'merged',
    label: t('channels.selection.merged'),
    disabled: !mergedEligibility.value.eligible,
  },
])

watch(
  () =>
    [props.open, props.messages.map((message) => message.ref.messageClientId).join(':')] as const,
  ([open]) => {
    if (!open) return
    selected.value = []
    comment.value = ''
    mode.value =
      props.initialMode === 'merged' && mergedEligibility.value.eligible
        ? 'merged'
        : individualEligibility.value.eligible
          ? 'individual'
          : 'merged'
  },
  { immediate: true },
)

function setSelected(channelRef: string, checked: boolean): void {
  if (!checked) {
    selected.value = selected.value.filter((value) => value !== channelRef)
    return
  }
  if (selected.value.length >= FORWARD_TARGET_LIMIT || selected.value.includes(channelRef)) return
  selected.value = [...selected.value, channelRef]
}

function confirm(): void {
  if (!selected.value.length || !modeEligibility.value.eligible) return
  const value = comment.value.trim()
  emit('confirm', {
    channelRefs: selected.value,
    mode: mode.value,
    ...(value ? { comment: value } : {}),
  })
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('channels.message.forwardTitle')"
    :close-label="t('common.close')"
    width="default"
    dismissable
    @close="emit('close')"
  >
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm font-medium text-fg">
        {{ t('channels.selection.selectedSummary', { count: messages.length }) }}
      </span>
      <SegmentedChoice
        v-model="mode"
        :options="modeOptions"
        :label="t('channels.selection.mode')"
      />
    </div>
    <div class="mt-3 space-y-1 border-l-2 border-line-strong pl-3">
      <p
        v-for="message in messages.slice(0, 3)"
        :key="message.ref.messageClientId"
        class="truncate text-sm text-dim"
      >
        <span class="font-semibold text-fg">{{ message.sender.name }}:</span>
        {{ message.text }}
      </p>
    </div>
    <div
      class="mt-5 flex items-center justify-between border-b border-line pb-2 text-xs text-subtle"
    >
      <span>{{ t('channels.selection.targets') }}</span>
      <span>{{
        t('channels.selection.targetCount', { count: selected.length, limit: FORWARD_TARGET_LIMIT })
      }}</span>
    </div>
    <div class="divide-y divide-line border-b border-line">
      <TeaCheckbox
        v-for="channel in availableChannels"
        :key="channel.ref"
        class="flex min-h-11 w-full gap-3 py-2"
        :model-value="selected.includes(channel.ref)"
        :label="channel.name"
        :disabled="
          pending || (!selected.includes(channel.ref) && selected.length >= FORWARD_TARGET_LIMIT)
        "
        @update:model-value="setSelected(channel.ref, $event)"
      >
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-fg">{{ channel.name }}</span>
        <span class="shrink-0 text-xs text-subtle">{{ t(`channels.kind.${channel.kind}`) }}</span>
      </TeaCheckbox>
    </div>
    <TeaTextarea
      v-model="comment"
      class="mt-5"
      :label="t('channels.selection.comment')"
      :placeholder="t('channels.selection.commentPlaceholder')"
      :rows="3"
      :disabled="pending"
    />
    <template #footer>
      <TeaButton :disabled="pending" @click="emit('close')">{{
        t('channels.message.cancel')
      }}</TeaButton>
      <TeaButton
        appearance="primary"
        :loading="pending"
        :disabled="selected.length === 0 || !modeEligibility.eligible"
        @click="confirm"
      >
        {{ t('channels.message.forwardConfirm') }}
      </TeaButton>
    </template>
  </TeaDialog>
</template>

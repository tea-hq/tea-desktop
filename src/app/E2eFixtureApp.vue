<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { fullAgentProfile } from '@/app/composerProfiles'
import WorkspaceRail from '@/app/components/WorkspaceRail.vue'
import WindowChrome from '@/app/components/WindowChrome.vue'
import WorkspaceSearchField from '@/app/components/WorkspaceSearchField.vue'
import ChannelConnectionPanel from '@/features/channels/components/ChannelConnectionPanel.vue'
import ChannelForwardDialog from '@/features/channels/components/ChannelForwardDialog.vue'
import ChannelMergedMessagesDialog from '@/features/channels/components/ChannelMergedMessagesDialog.vue'
import ChannelMediaViewer from '@/features/channels/components/ChannelMediaViewer.vue'
import ChannelReceiptDetailsDialog from '@/features/channels/components/ChannelReceiptDetailsDialog.vue'
import ChannelPinnedMessagesDialog from '@/features/channels/components/ChannelPinnedMessagesDialog.vue'
import ChannelSavedMessagesDialog from '@/features/channels/components/ChannelSavedMessagesDialog.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import ChannelThreadPanel from '@/features/channels/components/ChannelThreadPanel.vue'
import type { MessageAction } from '@/features/channels/components/ChannelMessageActions.vue'
import type {
  Channel,
  ChannelDraft,
  ChannelMember,
  ChannelMediaSaveState,
  ChannelPresence,
  ChannelVoicePlaybackRate,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
  ChannelThread,
  ForwardMessageMode,
  Message,
  MessageReceiptDetails,
  OutgoingMessageAttempt,
  PinnedMessage,
  SavedMessage,
} from '@/features/channels/contracts'
import { createTextMessageContent } from '@/features/channels/messageContent'
import { sameMessage } from '@/features/channels/projection'
import { messageSelectionKey } from '@/features/channels/useChannelMessageSelection'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import DraftEditorDialog from '@/features/collaboration/components/DraftEditorDialog.vue'
import type { AgentDrawerChannelState } from '@/features/collaboration/agentDrawerContracts'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import ConversationSidebar from '@/features/conversation/components/ConversationSidebar.vue'
import DirectoryPage from '@/features/directory/components/DirectoryPage.vue'
import TaskWorkspace from '@/features/tasks/components/TaskWorkspace.vue'
import type { DirectoryUser } from '@/features/directory/contracts'
import SettingsPage from '@/features/settings/components/SettingsPage.vue'
import type {
  AppSettings,
  LocalePreference,
  NotificationPreviewPreference,
} from '@/features/settings/contracts'
import type { WorkspaceMode } from '@/app/components/WorkspaceRail.vue'
import type {
  ComposerAttachment,
  ConversationSummary,
  ConversationTurn,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '@/features/conversation/contracts'
import type { Delivery, Draft } from '@/types/channelCollaboration'
import mediaReviewImageUrl from '@/assets/fixtures/channel-media-review.svg?url'
import mediaReviewVideoUrl from '@/assets/fixtures/channel-media-review.mp4?url'

const params = new URLSearchParams(window.location.search)
const fixture = ref(params.get('fixture') ?? 'drawer-empty')
const globalSearchQuery = ref('')
const multipleRoles = params.get('roles') === 'multiple'
const channelLoading = computed(() => fixture.value === 'channel-loading')
const { locale, t } = useI18n()
const settingsFixture = computed(() => fixture.value.startsWith('settings'))
locale.value = params.get('lang') === 'zh-CN' ? 'zh-CN' : 'en'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt', 'history', 'approval', 'cancel'],
  status: 'ready',
}
const alternateRuntime: RuntimeDescriptor = {
  ...runtime,
  id: 'external.codex',
  displayName: 'Codex',
}
const availableRuntimes = [runtime, alternateRuntime]
const fixtureModelOptions: ModelOption[] = [
  { value: 'gpt-5.6-sol', label: '5.6 Sol', source: 'runtime' },
  { value: 'gpt-5.6-terra', label: '5.6 Terra', source: 'runtime' },
  { value: 'gpt-5.6-luna', label: '5.6 Luna', source: 'runtime' },
  { value: 'gpt-5.5', label: '5.5', source: 'runtime' },
  { value: 'gpt-5.2', label: '5.2', source: 'runtime' },
]
const fixtureSettings = reactive<AppSettings>({
  locale: locale.value as LocalePreference,
  theme: 'light',
  notifications: {
    enabled: fixture.value !== 'settings-disabled',
    sound: fixture.value !== 'settings-disabled',
    preview: 'message',
  },
  conversationDefaults: { runtimeId: runtime.id, model: fixtureModelOptions[0]!.value },
  layout: { leftSidebarOpen: true, agentDrawerOpen: false },
})
const settingsSaving = computed(() => fixture.value === 'settings-saving')
const binding = { transportId: 'fixture.im', accountRef: 'e2e-account', channelRef: 'product' }
const fixtureUserProfiles = new Map([
  ['fixture-account', { accountId: 'fixture-account', name: 'Jing Deng' }],
])
const channel: Channel = {
  ref: binding.channelRef,
  kind: 'group',
  name: 'Product design',
  description: 'Desktop Agent experience',
  memberCount: 18,
  pinned: true,
  muted: false,
  unreadCount: 3,
  updatedAt: 1_787_843_600_000,
  lastMessagePreview: 'The drawer direction is approved.',
}
const channels: Channel[] = [
  channel,
  {
    ref: 'engineering',
    kind: 'group',
    name: 'Engineering',
    description: 'Implementation coordination',
    memberCount: 24,
    pinned: false,
    muted: true,
    unreadCount: 0,
    updatedAt: 1_787_843_000_000,
    lastMessagePreview: 'Type checks are green.',
  },
]
const directChannel: Channel = {
  ref: 'lin-direct',
  kind: 'direct',
  directAccountId: 'lin',
  name: 'Lin Chen',
  description: 'Product designer',
  pinned: false,
  muted: false,
  unreadCount: 0,
  updatedAt: 1_787_843_300_000,
  lastMessagePreview: 'I will review the latest proposal.',
}
const isPresenceFixture = computed(() => fixture.value.startsWith('presence-'))
const fixtureActiveChannel = computed(() =>
  isPresenceFixture.value && fixture.value !== 'presence-group' ? directChannel : channel,
)
const fixtureChannels = computed(() =>
  isPresenceFixture.value ? [directChannel, ...channels] : channels,
)
const fixturePresences = computed<ChannelPresence[]>(() => {
  if (!isPresenceFixture.value) return []
  const availability =
    fixture.value === 'presence-offline'
      ? 'offline'
      : fixture.value === 'presence-unknown'
        ? 'unknown'
        : 'online'
  return [{ accountId: 'lin', availability, updatedAt: 1_787_843_700_000 }]
})
const imDraftText = ref(fixture.value === 'im-draft' ? '@Lin review the release notes' : '')
const imDrafts = computed<ChannelDraft[]>(() =>
  imDraftText.value.trim()
    ? [
        {
          accountRef: binding.accountRef,
          channelRef: channel.ref,
          text: imDraftText.value,
          mentions: [],
          updatedAt: 1_787_843_700_000,
        },
      ]
    : [],
)
const messages: Message[] = [
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-1', messageServerId: 'server-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: 1_787_843_000_000,
    text: 'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    content: createTextMessageContent(
      'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    ),
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [{ type: 1, count: 3, active: false }],
  },
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-2', messageServerId: 'server-2' },
    sender: { id: 'current', name: 'Jing', isCurrentUser: true },
    sentAt: 1_787_843_300_000,
    text: 'Yes. The same conversation surface will be reused in drawer and full workspace modes.',
    content: createTextMessageContent(
      'Yes. The same conversation surface will be reused in drawer and full workspace modes.',
    ),
    state: 'active',
    sentByCurrentUser: true,
    pinned: false,
    reactions: [],
    receipt: { readCount: 12, unreadCount: 5 },
  },
]
const isThreadFixture = computed(() => fixture.value.startsWith('thread-'))
const threadReplyFixtures: Message[] = [
  {
    ref: {
      channelRef: channel.ref,
      messageClientId: 'thread-reply-1',
      messageServerId: 'thread-server-1',
    },
    sender: { id: 'current', name: 'Jing', isCurrentUser: true },
    sentAt: 1_787_843_700_000,
    text: 'Keep the decision attached to its source message.',
    content: createTextMessageContent('Keep the decision attached to its source message.'),
    replyTo: {
      ref: messages[0]!.ref,
      senderName: messages[0]!.sender.name,
      text: messages[0]!.text,
    },
    state: 'active',
    sentByCurrentUser: true,
    pinned: false,
    reactions: [],
  },
  {
    ref: {
      channelRef: channel.ref,
      messageClientId: 'thread-reply-2',
      messageServerId: 'thread-server-2',
    },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: 1_787_843_760_000,
    text: 'I will use this thread for the review follow-up.',
    content: createTextMessageContent('I will use this thread for the review follow-up.'),
    replyTo: {
      ref: messages[0]!.ref,
      senderName: messages[0]!.sender.name,
      text: messages[0]!.text,
    },
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  },
]
const fixtureThreadReplies = ref<Message[]>(
  fixture.value === 'thread-replies' ? structuredClone(threadReplyFixtures) : [],
)
const threadFixtureLoading = ref(fixture.value === 'thread-loading')
const threadFixtureErrorCode = ref<string | null>(
  fixture.value === 'thread-error' ? 'transport' : null,
)
const threadOpen = ref(
  isThreadFixture.value &&
    fixture.value !== 'thread-root-revoked' &&
    fixture.value !== 'thread-root-deleted',
)
const threadRootMessage = computed(() => {
  if (fixture.value === 'thread-root-deleted') return null
  if (fixture.value === 'thread-root-revoked')
    return {
      ...messages[0]!,
      text: '',
      content: { kind: 'redacted' as const, reason: 'revoked' as const },
      state: 'revoked' as const,
    }
  return messages[0]!
})
const fixtureThread = computed<ChannelThread | null>(() => {
  if (!isThreadFixture.value || threadFixtureLoading.value || threadFixtureErrorCode.value)
    return null
  const root = threadRootMessage.value
  if (!root || root.state !== 'active') return null
  const replies = fixtureThreadReplies.value
  return {
    channelRef: channel.ref,
    root,
    replies,
    replyCount: replies.length,
    updatedAt: Math.max(root.sentAt, replies.at(-1)?.sentAt ?? root.sentAt),
  }
})
const voiceMessage: Message = {
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-voice',
    messageServerId: 'server-voice',
  },
  sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
  sentAt: 1_787_843_600_000,
  text: '[audio: release-update.aac]',
  content: {
    kind: 'audio',
    caption: 'Release readiness update',
    media: {
      url: 'https://media.example.test/release-update.aac',
      name: 'release-update.aac',
      mimeType: 'audio/aac',
      durationMs: 18_000,
    },
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}
const mediaImageMessage: Message = {
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-media-image',
    messageServerId: 'server-media-image',
  },
  sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
  sentAt: 1_787_843_500_000,
  text: '[image: channel-media-review.svg]',
  content: {
    kind: 'image',
    caption: 'Provider-neutral media workflow review',
    media: {
      url: mediaReviewImageUrl,
      name: 'channel-media-review.svg',
      mimeType: 'image/svg+xml',
      size: 2_998,
      width: 960,
      height: 600,
    },
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}
const mediaVideoMessage: Message = {
  ...mediaImageMessage,
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-media-video',
    messageServerId: 'server-media-video',
  },
  sentAt: 1_787_843_560_000,
  text: '[video: channel-media-review.mp4]',
  content: {
    kind: 'video',
    caption: 'Two-second interaction walkthrough',
    media: {
      url: mediaReviewVideoUrl,
      name: 'channel-media-review.mp4',
      mimeType: 'video/mp4',
      size: 17_000,
      width: 960,
      height: 600,
      durationMs: 2_000,
    },
  },
}
const missingMediaMessage: Message = {
  ...mediaImageMessage,
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-media-missing',
    messageServerId: 'server-media-missing',
  },
  sentAt: 1_787_843_620_000,
  text: '[file: rollout-checklist.pdf]',
  content: {
    kind: 'file',
    caption: 'Attachment metadata remains visible when its source is unavailable.',
    media: { name: 'rollout-checklist.pdf', mimeType: 'application/pdf', size: 84_000 },
  },
}
const mediaMessages = [mediaImageMessage, mediaVideoMessage, missingMediaMessage]
const isMediaFixture = computed(() => fixture.value.startsWith('media-'))

function initialMediaSaveStates(): ChannelMediaSaveState[] {
  const base: ChannelMediaSaveState = {
    operationId: 'fixture-media-save',
    messageRef: mediaImageMessage.ref,
    status: 'choosing',
    receivedBytes: 0,
    retryable: false,
  }
  if (fixture.value === 'media-choosing') return [base]
  if (fixture.value === 'media-saving')
    return [{ ...base, status: 'saving', receivedBytes: 1_536, totalBytes: 2_998 }]
  if (fixture.value === 'media-saved')
    return [
      {
        ...base,
        status: 'saved',
        receivedBytes: 2_998,
        totalBytes: 2_998,
        fileName: 'channel-media-review.svg',
        byteLength: 2_998,
      },
    ]
  if (fixture.value === 'media-error')
    return [
      {
        ...base,
        status: 'failed',
        errorCode: 'downloadFailed',
        retryable: true,
      },
    ]
  if (fixture.value === 'media-missing')
    return [
      {
        ...base,
        messageRef: missingMediaMessage.ref,
        status: 'failed',
        errorCode: 'mediaUnavailable',
        retryable: false,
      },
    ]
  return []
}

const fixtureMediaSaves = ref<ChannelMediaSaveState[]>(initialMediaSaveStates())
const mediaViewerMessage = ref<Message | null>(
  fixture.value === 'media-image-viewer'
    ? mediaImageMessage
    : fixture.value === 'media-video-viewer'
      ? mediaVideoMessage
      : null,
)
const mediaViewerIndex = computed(() =>
  mediaViewerMessage.value
    ? mediaMessages
        .filter((message) => message.content.kind === 'image' || message.content.kind === 'video')
        .findIndex((message) => sameMessage(message.ref, mediaViewerMessage.value!.ref))
    : -1,
)
const mediaViewerSave = computed(() =>
  mediaViewerMessage.value
    ? (fixtureMediaSaves.value.find((state) =>
        sameMessage(state.messageRef, mediaViewerMessage.value!.ref),
      ) ?? null)
    : null,
)
const isVoiceTranscriptionFixture = computed(() => fixture.value.startsWith('voice-transcription-'))
const isVoicePlaybackFixture = computed(() => fixture.value.startsWith('voice-playback-'))
const fixtureVoiceTranscripts = computed<ChannelVoiceTranscript[]>(() => {
  if (!isVoiceTranscriptionFixture.value || fixture.value === 'voice-transcription-idle') return []
  if (fixture.value === 'voice-transcription-loading') {
    return [{ messageRef: voiceMessage.ref, status: 'loading', retryable: false }]
  }
  if (fixture.value === 'voice-transcription-error') {
    return [
      {
        messageRef: voiceMessage.ref,
        status: 'failed',
        errorCode: 'transport',
        retryable: true,
      },
    ]
  }
  return [
    {
      messageRef: voiceMessage.ref,
      status: 'ready',
      text: 'The release candidate is ready. Please review the rollout checklist before 4 PM.',
      retryable: false,
    },
  ]
})
const fixtureVoicePlaybackRate = computed<ChannelVoicePlaybackRate>(() =>
  fixture.value === 'voice-playback-playing' || fixture.value === 'voice-playback-paused' ? 1.5 : 1,
)
const fixtureVoicePlaybacks = computed<ChannelVoicePlaybackState[]>(() => {
  if (!isVoicePlaybackFixture.value || fixture.value === 'voice-playback-idle') return []
  const base = {
    messageRef: voiceMessage.ref,
    durationMs: 18_000,
    playbackRate: fixtureVoicePlaybackRate.value,
    retryable: false,
  }
  if (fixture.value === 'voice-playback-loading') {
    return [{ ...base, status: 'loading', positionMs: 0 }]
  }
  if (fixture.value === 'voice-playback-playing') {
    return [{ ...base, status: 'playing', positionMs: 6_000 }]
  }
  if (fixture.value === 'voice-playback-error') {
    return [
      {
        ...base,
        status: 'failed',
        positionMs: 4_000,
        errorCode: 'network',
        retryable: true,
      },
    ]
  }
  return [{ ...base, status: 'paused', positionMs: 9_000 }]
})
const outgoingAttempts = computed<OutgoingMessageAttempt[]>(() => {
  if (!fixture.value.startsWith('message-delivery')) return []
  const base = {
    idempotencyKey: 'fixture-send-key',
    channelRef: channel.ref,
    mentions: [],
    createdAt: 1_787_843_700_000,
    attemptNumber: 1,
  }
  const sending: OutgoingMessageAttempt = {
    ...base,
    attemptId: 'fixture-sending',
    operationId: 'fixture-operation-sending',
    content: {
      kind: 'image',
      caption: 'Updated desktop mockup',
      media: {
        source: { kind: 'localFile', token: 'fixture-image' },
        name: 'tea-desktop-agent-collaboration-review-final.png',
      },
    },
    status: 'sending',
    progress: 64,
    retryable: false,
  }
  const failed: OutgoingMessageAttempt = {
    ...base,
    attemptId: 'fixture-failed',
    idempotencyKey: 'fixture-failed-key',
    operationId: 'fixture-operation-failed',
    content: { kind: 'text', text: 'Please review the latest interaction notes.' },
    status: 'failed',
    progress: 0,
    retryable: true,
    errorCode: 'transport',
  }
  const cancelled: OutgoingMessageAttempt = {
    ...base,
    attemptId: 'fixture-cancelled',
    idempotencyKey: 'fixture-cancelled-key',
    operationId: 'fixture-operation-cancelled',
    content: {
      kind: 'file',
      media: { source: { kind: 'localFile', token: 'fixture-file' }, name: 'release-notes.pdf' },
    },
    status: 'cancelled',
    progress: 0,
    retryable: true,
  }
  if (fixture.value === 'message-delivery-sending') return [sending]
  if (fixture.value === 'message-delivery-failed') return [failed]
  if (fixture.value === 'message-delivery-cancelled') return [cancelled]
  return [sending, failed, cancelled]
})
const mentionMembers: ChannelMember[] = [
  { accountId: 'lin', name: 'Lin', role: 'member', chatBanned: false },
  { accountId: 'kai', name: 'Kai', role: 'manager', chatBanned: false },
  { accountId: 'maya', name: 'Maya Chen', role: 'member', chatBanned: false },
]
const receiptDetailsOpen = ref(fixture.value === 'receipt-details')
const receiptDetails: MessageReceiptDetails = {
  messageRef: messages[1]!.ref,
  read: [
    { id: 'lin', name: 'Lin', isCurrentUser: false },
    { id: 'kai', name: 'Kai', isCurrentUser: false },
  ],
  unread: [{ id: 'maya', name: 'Maya Chen', isCurrentUser: false }],
  readCount: 12,
  unreadCount: 5,
}
const mergedMessage: Message = {
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-merged',
    messageServerId: 'server-merged',
  },
  sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
  sentAt: 1_787_843_500_000,
  text: 'Product design chat history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Product design',
    abstracts: [
      {
        senderAccountId: 'designer',
        senderName: 'Lin',
        text: 'Keep the Channel timeline focused on collaboration.',
      },
      {
        senderAccountId: 'current',
        senderName: 'Jing',
        text: 'The Agent drawer can preserve the complete work context.',
      },
    ],
    depth: 1,
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}
const nestedMergedMessage: Message = {
  ...mergedMessage,
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-merged-nested',
    messageServerId: 'server-merged-nested',
  },
  sender: { id: 'engineer', name: 'Kai', isCurrentUser: false },
  text: 'Engineering chat history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Engineering',
    abstracts: [
      {
        senderAccountId: 'engineer',
        senderName: 'Kai',
        text: 'The provider-neutral boundary is ready for review.',
      },
    ],
    depth: 2,
  },
}
const archivedMessages: Message[] = [messages[0]!, messages[1]!, nestedMergedMessage]
const timelineMessages = computed<Message[]>(() => {
  if (isThreadFixture.value) {
    const root = threadRootMessage.value
    return root ? [root, ...messages.slice(1)] : messages.slice(1)
  }
  if (fixture.value === 'merged-card') return [...messages, mergedMessage]
  if (isMediaFixture.value) return [...messages, ...mediaMessages]
  if (isVoiceTranscriptionFixture.value || isVoicePlaybackFixture.value)
    return [...messages, voiceMessage]
  return messages
})
const selectingMessages = ref(fixture.value === 'message-selection')
const selectedMessageKeys = computed(() =>
  selectingMessages.value ? messages.map(messageSelectionKey) : [],
)
const forwardingMessages = ref<Message[]>(
  fixture.value === 'message-forwarding' ? [...messages] : [],
)
const forwardingMode = ref<ForwardMessageMode>('merged')
const mergedViewerMessage = ref<Message | null>(
  fixture.value.startsWith('merged-') && fixture.value !== 'merged-card' ? mergedMessage : null,
)
const mergedViewerItems = ref<Message[]>(fixture.value === 'merged-viewer' ? archivedMessages : [])
const mergedViewerLoading = ref(fixture.value === 'merged-loading')
const mergedViewerErrorCode = ref<string | null>(
  fixture.value === 'merged-error' ? 'archive_checksum_mismatch' : null,
)
const mergedViewerCanGoBack = ref(false)
const pinnedMessages: PinnedMessage[] = messages.map((message, index) => ({
  message: { ...message, pinned: true },
  pinnedByAccountId: index === 0 ? 'designer' : 'current',
  pinnedAt: message.sentAt + 60_000,
}))
const savedMessages: SavedMessage[] = messages.map((message, index) => ({
  id: `saved-${index + 1}`,
  message,
  sourceChannelName: channel.name,
  savedAt: message.sentAt + 120_000,
}))
const activeTurn: ConversationTurn = {
  id: 'turn-1',
  user: { id: 'prompt-1', text: 'Review the Agent drawer proposal.', attachments: [] },
  blocks: [
    {
      kind: 'assistantText',
      id: 'block-1',
      sequence: 1,
      text: 'The drawer reduces persistent chrome while preserving model, permission, Role, attachment, source, and approval controls.',
      streaming: false,
    },
  ],
  status: 'completed',
  lastEventSequence: 2,
}
const approvalTurn: ConversationTurn = {
  id: 'turn-2',
  user: { id: 'prompt-2', text: 'Apply the approved visual changes.', attachments: [] },
  blocks: [
    {
      kind: 'toolCall',
      id: 'tool-1',
      sequence: 1,
      name: 'workspace.edit',
      status: 'approvalRequired',
      approval: {
        id: 'approval-1',
        toolCallId: 'tool-1',
        toolName: 'workspace.edit',
        capabilities: ['write'],
        resources: ['src/App.vue'],
        decisions: ['allowOnce', 'deny'],
        status: 'pending',
      },
    },
  ],
  status: 'running',
  lastEventSequence: 1,
}
const conversations = ref<ConversationSummary[]>(
  Array.from({ length: 10 }, (_, index) => ({
    conversationId: `conversation-${index}`,
    runtimeId: runtime.id,
    workspaceId: 'e2e',
    title: index === 0 ? 'Agent drawer architecture' : `Product session ${index + 1}`,
    lastMessagePreview: 'Reviewing interaction details and implementation state.',
    createdAt: 1_787_840_000_000 + index,
    updatedAt: 1_787_843_000_000 + index,
    channelBinding: binding,
  })),
)
const initialPhase =
  fixture.value === 'drawer-empty' || fixture.value === 'drawer-recent'
    ? 'index'
    : fixture.value === 'drawer-preparing'
      ? 'preparing'
      : 'active'
const drawerState = reactive<AgentDrawerChannelState>({
  binding,
  phase: initialPhase,
  listMode: 'recent',
  query: '',
  scrollOffset: 0,
  selectedConversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  draft: {
    runtimeId: runtime.id,
    model: fixtureModelOptions[0]!.value,
    permissionMode: 'default',
    roleId: null,
    text: initialPhase === 'preparing' ? 'Create a concise implementation plan' : '',
    attachments: [],
    sources: [],
    creationIdempotencyKey: 'e2e:first-send',
    conversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  },
})
const drawerOpen = ref(fixture.value.startsWith('drawer'))
const turns = ref<ConversationTurn[]>(
  fixture.value === 'drawer-active' ||
    fixture.value === 'draft-dialog' ||
    fixture.value === 'full-agent'
    ? [activeTurn, approvalTurn]
    : [],
)
const fullText = ref('')
const fullAttachments = ref<ComposerAttachment[]>([])
const fullRuntimeId = ref(runtime.id)
const fullModel = ref(fixtureModelOptions[0]!.value)
const fullPermissionMode = ref<PermissionMode>('default')
const fullRoleId = ref<string | null>(null)
const roleOptions = [
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Keep changes focused and verify the result.',
    prompt: 'Review the task for correctness, scope, and test coverage.',
    skills: ['code-review', 'testing', 'accessibility'],
    revision: 2,
    runtimeId: runtime.id,
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Turn ambiguous requests into clear implementation steps.',
    prompt: 'Build a concise implementation plan with risks and checkpoints.',
    skills: ['planning', 'architecture'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'builder',
    name: 'Builder',
    description: 'Make focused changes and verify them with the right checks.',
    prompt: 'Implement the requested change and run the relevant checks.',
    skills: ['typescript', 'testing'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Map unfamiliar code and surface the important dependencies.',
    prompt: 'Explore the codebase and summarize the relevant ownership boundaries.',
    skills: ['code-search', 'architecture'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Shape technical work into concise, readable documentation.',
    prompt: 'Draft clear documentation that captures decisions and next steps.',
    skills: ['documentation', 'editing'],
    revision: 1,
    runtimeId: runtime.id,
  },
]
const fixtureRoles = multipleRoles ? roleOptions : roleOptions.slice(0, 1)
const directoryUsers: DirectoryUser[] = [
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-lin', displayName: 'Lin Zhixu' },
    oidc: {
      subject: 'oidc-lin',
      preferredUsername: 'zhixu.lin',
      email: 'zhixu.lin@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_zhixu', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-chen', displayName: 'Chen Wangshu' },
    oidc: {
      subject: 'oidc-chen',
      preferredUsername: 'wangshu.chen',
      email: 'wangshu.chen@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_wangshu', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-zhou', displayName: 'Zhou Jianwei' },
    oidc: {
      subject: 'oidc-zhou',
      preferredUsername: 'zhou-jianwei-with-a-long-identity',
      email: 'jianwei.zhou@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_jianwei', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-song', displayName: 'Song Yuan' },
    oidc: {
      subject: 'oidc-song',
      preferredUsername: 'song.yuan',
      emailVerified: false,
    },
    im: { provider: 'Yunxin', status: 'unavailable' },
  },
]
const directoryQuery = ref('')
const directoryMessageUser = ref<DirectoryUser | null>(null)
const filteredDirectoryUsers = computed(() => {
  const query = directoryQuery.value.trim().toLocaleLowerCase()
  if (!query) return directoryUsers
  return directoryUsers.filter((user) =>
    [
      user.center.displayName,
      user.center.userId,
      user.oidc.preferredUsername,
      user.oidc.email,
      user.im?.account,
    ].some((value) => value?.toLocaleLowerCase().includes(query)),
  )
})
const activeMode = ref<WorkspaceMode>(
  settingsFixture.value
    ? 'settings'
    : fixture.value === 'tasks'
      ? 'tasks'
      : fixture.value.startsWith('directory')
        ? 'directory'
        : fixture.value === 'full-agent'
          ? 'agent'
          : 'channels',
)
const draftDialogOpen = ref(fixture.value === 'draft-dialog')
const draft = ref<Draft>({
  draftId: 'draft-1',
  conversationId: conversations.value[0]!.conversationId,
  sourceTurnIndex: 0,
  sourceBlockId: 'block-1',
  currentVersion: 1,
  content: 'Share the reviewed drawer implementation with the Channel.',
  createdAt: 1_787_843_400_000,
  updatedAt: 1_787_843_400_000,
})
const delivery = ref<Delivery | undefined>()
const visibleConversations = computed(() =>
  fixture.value === 'drawer-empty' && drawerState.phase === 'index' ? [] : conversations.value,
)

function createSession(): void {
  drawerState.phase = 'preparing'
  drawerState.selectedConversationId = null
}
function createSessionWithRuntime(runtimeId: string): void {
  drawerState.draft.runtimeId = runtimeId
  createSession()
}
function selectSession(id: string): void {
  drawerState.phase = 'active'
  drawerState.selectedConversationId = id
  drawerState.draft.conversationId = id
}
function send(payload: { text: string; attachments: ComposerAttachment[] }): void {
  if (drawerState.phase === 'preparing') {
    const summary: ConversationSummary = {
      conversationId: 'conversation-created',
      runtimeId: drawerState.draft.runtimeId ?? runtime.id,
      workspaceId: 'e2e',
      title: 'New Agent session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      channelBinding: binding,
    }
    conversations.value.unshift(summary)
    drawerState.phase = 'active'
    drawerState.selectedConversationId = summary.conversationId
    drawerState.draft.conversationId = summary.conversationId
  }
  turns.value.push({
    id: `turn-${turns.value.length + 1}`,
    user: { id: crypto.randomUUID(), text: payload.text, attachments: [] },
    blocks: [],
    status: 'running',
    lastEventSequence: 0,
  })
  drawerState.draft.text = ''
}
function createFullSessionWithRuntime(runtimeId: string): void {
  fullRuntimeId.value = runtimeId
  fullText.value = ''
  turns.value = []
  activeMode.value = 'agent'
}
function createFullSession(): void {
  createFullSessionWithRuntime(runtime.id)
}
function injectPrompt(current: string, prompt: string): string {
  const next = prompt.trim()
  if (!next) return current
  const existing = current.trim()
  return existing ? `${existing}\n\n${next}` : next
}
function saveDraft(content: string): void {
  draft.value = {
    ...draft.value,
    content,
    currentVersion: draft.value.currentVersion + 1,
    updatedAt: Date.now(),
  }
}
function deliverDraft(): void {
  delivery.value = {
    deliveryId: 'delivery-1',
    draftId: draft.value.draftId,
    draftVersion: draft.value.currentVersion,
    channelBinding: binding,
    idempotencyKey: 'e2e:delivery',
    status: 'sent',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
function openFixtureForwarding(mode: ForwardMessageMode): void {
  forwardingMode.value = mode
  forwardingMessages.value = [...messages]
}
function openFixtureMergedMessage(message: Message): void {
  if (message.content.kind !== 'merged') return
  const nested = message.ref.messageClientId === nestedMergedMessage.ref.messageClientId
  mergedViewerMessage.value = message
  mergedViewerItems.value = nested ? [] : archivedMessages
  mergedViewerLoading.value = false
  mergedViewerErrorCode.value = null
  mergedViewerCanGoBack.value = nested
}
function retryFixtureMergedMessages(): void {
  mergedViewerLoading.value = false
  mergedViewerErrorCode.value = null
  mergedViewerItems.value = archivedMessages
  mergedViewerCanGoBack.value = false
}

function openFixtureMedia(message: Message): void {
  if (message.content.kind === 'image' || message.content.kind === 'video')
    mediaViewerMessage.value = message
}

function navigateFixtureMedia(direction: -1 | 1): void {
  const viewable = mediaMessages.filter(
    (message) => message.content.kind === 'image' || message.content.kind === 'video',
  )
  const message = viewable[mediaViewerIndex.value + direction]
  if (message) mediaViewerMessage.value = message
}

function saveFixtureMedia(message: Message): void {
  fixtureMediaSaves.value = [
    {
      operationId: 'fixture-media-save-active',
      messageRef: message.ref,
      status: 'saving',
      receivedBytes: 1_536,
      totalBytes: message.content.kind === 'text' ? undefined : 2_998,
      retryable: false,
    },
  ]
}

function cancelFixtureMediaSave(message: Message): void {
  fixtureMediaSaves.value = [
    {
      operationId: 'fixture-media-save-cancelled',
      messageRef: message.ref,
      status: 'cancelled',
      receivedBytes: 0,
      retryable: false,
    },
  ]
}

function updateFixtureLocale(value: LocalePreference): void {
  fixtureSettings.locale = value
  locale.value = value === 'zh-CN' ? 'zh-CN' : 'en'
}

function updateFixtureTheme(value: AppSettings['theme']): void {
  fixtureSettings.theme = value
}

function updateFixtureNotificationsEnabled(enabled: boolean): void {
  fixtureSettings.notifications.enabled = enabled
}

function updateFixtureNotificationSound(sound: boolean): void {
  fixtureSettings.notifications.sound = sound
}

function updateFixtureNotificationPreview(preview: NotificationPreviewPreference): void {
  fixtureSettings.notifications.preview = preview
}

function updateFixtureDefaultRuntime(runtimeId: string): void {
  fixtureSettings.conversationDefaults.runtimeId = runtimeId
}

function updateFixtureDefaultModel(model: string): void {
  fixtureSettings.conversationDefaults.model = model
}

function openFixtureThread(message: Message): void {
  if (!isThreadFixture.value || message.state !== 'active') return
  threadOpen.value = true
  threadFixtureLoading.value = false
  threadFixtureErrorCode.value = null
  fixtureThreadReplies.value =
    fixture.value === 'thread-replies' ? structuredClone(threadReplyFixtures) : []
}

function retryFixtureThread(): void {
  threadFixtureLoading.value = false
  threadFixtureErrorCode.value = null
}

function sendFixtureThread(payload: { text: string }): void {
  const root = threadRootMessage.value
  const normalized = payload.text.trim()
  if (!normalized || !root || root.state !== 'active') return
  const index = fixtureThreadReplies.value.length + 1
  fixtureThreadReplies.value.push({
    ref: {
      channelRef: channel.ref,
      messageClientId: `thread-reply-${index + 2}`,
    },
    sender: { id: 'current', name: 'Jing', isCurrentUser: true },
    sentAt: 1_787_843_800_000 + index,
    text: normalized,
    content: createTextMessageContent(normalized),
    replyTo: { ref: root.ref, senderName: root.sender.name, text: root.text },
    state: 'active',
    sentByCurrentUser: true,
    pinned: false,
    reactions: [],
  })
}

function handleFixtureMessageAction(payload: { message: Message; action: MessageAction }): void {
  if (payload.action === 'thread') openFixtureThread(payload.message)
}
</script>

<template>
  <WindowChrome>
    <template #toolbar>
      <WorkspaceSearchField
        v-model="globalSearchQuery"
        data-testid="fixture-global-search"
        :label="t('workspace.globalSearch')"
        :status-label="activeMode === 'channels' ? t('channels.connection.connected') : undefined"
        :status-class="activeMode === 'channels' ? 'bg-success' : undefined"
      />
    </template>
    <div class="flex h-full min-w-0 overflow-hidden bg-canvas text-fg" data-testid="e2e-app">
      <WorkspaceRail
        :active-mode="activeMode"
        :pending-tasks="1"
        :logout-pending="false"
        :user="{ displayName: 'Jing Deng', preferredUsername: 'jing', avatarUrl: '' }"
        :im-profile="fixtureUserProfiles.get('fixture-account')"
        @select="activeMode = $event"
      />

    <template v-if="activeMode === 'channels'">
      <ChannelSidebar
        :channels="channelLoading ? [] : fixtureChannels"
        :drafts="imDrafts"
        :presences="fixturePresences"
        :active-ref="fixtureActiveChannel.ref"
        :status="{ phase: 'connected', retryable: true }"
        :loading="channelLoading"
        :search-query="globalSearchQuery"
      />
      <ChannelConnectionPanel
        v-if="channelLoading"
        :status="{ phase: 'connected', retryable: true }"
        :error-code="null"
        managed-phase="ready"
        im-status="ready"
        :channels-loading="true"
        :pending="false"
      />
      <ChannelTimeline
        v-else
        :channel="fixtureActiveChannel"
        :presence="fixtureActiveChannel.kind === 'direct' ? fixturePresences[0] : null"
        :messages="timelineMessages"
        :thread-available="isThreadFixture"
        :voice-transcripts="fixtureVoiceTranscripts"
        :voice-transcription-available="isVoiceTranscriptionFixture"
        :voice-playbacks="fixtureVoicePlaybacks"
        :voice-playback-rate="fixtureVoicePlaybackRate"
        :voice-playback-available="isVoicePlaybackFixture"
        :media-saves="fixtureMediaSaves"
        :media-saving-available="isMediaFixture"
        :outgoing-attempts="outgoingAttempts"
        :panel-open="drawerOpen"
        :loading="false"
        :has-more="true"
        :active-conversation="conversations[0] ?? null"
        :recent-conversations="conversations.slice(0, 4)"
        :current-session-available="true"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :selection-mode="selectingMessages"
        :selected-message-keys="selectedMessageKeys"
        :selected-count="selectedMessageKeys.length"
        :can-forward-individual="selectedMessageKeys.length > 0"
        :can-forward-merged="selectedMessageKeys.length > 0"
        :mention-members="mentionMembers"
        :mention-members-loading="false"
        :draft="imDraftText"
        @toggle-panel="drawerOpen = !drawerOpen"
        @message-action="handleFixtureMessageAction"
        @toggle-message-selection="() => undefined"
        @select-all-visible="selectingMessages = true"
        @cancel-selection="selectingMessages = false"
        @forward-selection="openFixtureForwarding"
        @open-merged="openFixtureMergedMessage"
        @open-receipt-details="receiptDetailsOpen = true"
        @transcribe-voice="() => undefined"
        @toggle-voice-playback="() => undefined"
        @retry-voice-playback="() => undefined"
        @seek-voice-playback="() => undefined"
        @set-voice-playback-rate="() => undefined"
        @open-media="openFixtureMedia"
        @save-media="saveFixtureMedia"
        @cancel-media-save="cancelFixtureMediaSave"
        @retry-media-save="saveFixtureMedia"
        @update-draft="imDraftText = $event.text"
        @retry-outgoing="() => undefined"
        @cancel-outgoing="() => undefined"
        @dismiss-outgoing="() => undefined"
      />
      <ChannelThreadPanel
        v-if="threadOpen"
        :channel="fixtureActiveChannel"
        :root-message="threadRootMessage"
        :thread="fixtureThread"
        :loading="threadFixtureLoading"
        :error-code="threadFixtureErrorCode"
        :outgoing-attempts="[]"
        @close="threadOpen = false"
        @retry="retryFixtureThread"
        @send="sendFixtureThread"
      />
      <ChannelMediaViewer
        :open="mediaViewerMessage !== null"
        :message="mediaViewerMessage"
        :can-go-previous="mediaViewerIndex > 0"
        :can-go-next="mediaViewerIndex >= 0 && mediaViewerIndex < 1"
        :save-state="mediaViewerSave"
        :saving-available="isMediaFixture"
        @close="mediaViewerMessage = null"
        @previous="navigateFixtureMedia(-1)"
        @next="navigateFixtureMedia(1)"
        @save="mediaViewerMessage && saveFixtureMedia(mediaViewerMessage)"
        @cancel-save="mediaViewerMessage && cancelFixtureMediaSave(mediaViewerMessage)"
        @retry-save="mediaViewerMessage && saveFixtureMedia(mediaViewerMessage)"
      />
      <AgentDrawer
        :open="drawerOpen"
        :state="drawerState"
        :conversations="visibleConversations"
        :turns="turns"
        :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :model-options="fixtureModelOptions"
        :roles="fixtureRoles"
        @close="drawerOpen = false"
        @create="createSession"
        @create-with-runtime="createSessionWithRuntime"
        @select="selectSession"
        @view-all="drawerState.listMode = 'all'"
        @update-query="drawerState.query = $event"
        @update-text="drawerState.draft.text = $event"
        @update-attachments="drawerState.draft.attachments = $event"
        @select-runtime="drawerState.draft.runtimeId = $event"
        @select-model="drawerState.draft.model = $event"
        @select-permission="drawerState.draft.permissionMode = $event"
        @select-role="drawerState.draft.roleId = $event"
        @apply-role-prompt="drawerState.draft.text = injectPrompt(drawerState.draft.text, $event)"
        @send="send"
        @back="drawerState.phase = 'index'"
        @expand="activeMode = 'agent'"
        @create-draft="draftDialogOpen = true"
      />
      <ChannelPinnedMessagesDialog
        :open="fixture === 'pinned-messages'"
        :channel-name="channel.name"
        :items="pinnedMessages"
        :loading="false"
        :error-code="null"
      />
      <ChannelSavedMessagesDialog
        :open="fixture === 'saved-messages'"
        :items="savedMessages"
        :total-count="savedMessages.length"
        :loading="false"
        :loading-more="false"
        :has-more="true"
        :error-code="null"
        :removing-id="null"
      />
      <ChannelReceiptDetailsDialog
        :open="receiptDetailsOpen"
        :details="receiptDetails"
        :loading="false"
        :error-code="null"
        @close="receiptDetailsOpen = false"
      />
      <ChannelForwardDialog
        :open="forwardingMessages.length > 0"
        :messages="forwardingMessages"
        :channels="channels"
        :initial-mode="forwardingMode"
        :pending="false"
        @close="forwardingMessages = []"
        @confirm="forwardingMessages = []"
      />
      <ChannelMergedMessagesDialog
        :open="mergedViewerMessage !== null"
        :message="mergedViewerMessage"
        :items="mergedViewerItems"
        :loading="mergedViewerLoading"
        :error-code="mergedViewerErrorCode"
        :can-go-back="mergedViewerCanGoBack"
        @close="mergedViewerMessage = null"
        @retry="retryFixtureMergedMessages"
        @back="openFixtureMergedMessage(mergedMessage)"
        @open-merged="openFixtureMergedMessage"
      />
    </template>

    <DirectoryPage
      v-else-if="activeMode === 'directory'"
      :users="filteredDirectoryUsers"
      :total-count="directoryUsers.length"
      tenant-name="Tea Product Studio"
      phase="ready"
      :error-key="null"
      :query="directoryQuery"
      :action-error="null"
      @update:query="directoryQuery = $event"
      @message="directoryMessageUser = $event"
    />

    <TaskWorkspace v-else-if="activeMode === 'tasks'" :search-query="globalSearchQuery" />

    <template v-else-if="activeMode === 'agent'">
      <ConversationSidebar
        :conversations="conversations"
        :active-id="conversations[0]?.conversationId ?? null"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :loading="false"
        :loading-more="false"
        :error="null"
        :has-more="false"
        :filter="{ kind: 'all' }"
        :search-query="globalSearchQuery"
        @new="createFullSession"
      />
      <main class="min-w-0 flex-1">
        <AgentConversationSurface
          v-model:text="fullText"
          v-model:attachments="fullAttachments"
          :profile="fullAgentProfile"
          title="Agent drawer architecture"
          :runtime-label="
            availableRuntimes.find((value) => value.id === fullRuntimeId)?.displayName
          "
          :turns="turns"
          collaboration
          has-older
          :runtimes="availableRuntimes"
          :runtime-id="fullRuntimeId"
          :model-options="fixtureModelOptions"
          :model="fullModel"
          :permission-mode="fullPermissionMode"
          :new-conversation="turns.length === 0"
          :roles="fixtureRoles"
          :role-id="fullRoleId"
          @select-runtime="fullRuntimeId = $event"
          @send="send"
          @select-model="fullModel = $event"
          @select-permission="fullPermissionMode = $event"
          @create-draft="draftDialogOpen = true"
          @select-role="fullRoleId = $event"
          @apply-role-prompt="fullText = injectPrompt(fullText, $event)"
        />
      </main>
    </template>

    <main v-else class="min-w-0 flex-1">
      <SettingsPage
        :locale-preference="fixtureSettings.locale"
        :theme-preference="fixtureSettings.theme"
        :notification-settings="fixtureSettings.notifications"
        :default-runtime-id="fixtureSettings.conversationDefaults.runtimeId"
        :default-model="fixtureSettings.conversationDefaults.model"
        :model-options="fixtureModelOptions"
        :runtimes="availableRuntimes"
        :saving="settingsSaving"
        :error="null"
        @close="activeMode = 'channels'"
        @update-locale="updateFixtureLocale"
        @update-theme="updateFixtureTheme"
        @update-notifications-enabled="updateFixtureNotificationsEnabled"
        @update-notification-sound="updateFixtureNotificationSound"
        @update-notification-preview="updateFixtureNotificationPreview"
        @update-default-runtime="updateFixtureDefaultRuntime"
        @update-default-model="updateFixtureDefaultModel"
      />
    </main>

    <DraftEditorDialog
      :open="draftDialogOpen"
      :draft="draft"
      :delivery="delivery"
      @close="draftDialogOpen = false"
      @save="saveDraft"
      @deliver="deliverDraft"
    />
    </div>
  </WindowChrome>
</template>

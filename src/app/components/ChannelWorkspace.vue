<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import ChannelConnectionPanel from '@/features/channels/components/ChannelConnectionPanel.vue'
import ChannelSelectionPlaceholder from '@/features/channels/components/ChannelSelectionPlaceholder.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import type {
  ChannelDetails,
  ChannelAttachment,
  ChannelMember,
  ChannelRef,
  ForwardMessageMode,
  Message,
  MessageMention,
  MessageReceiptDetails,
  PinnedMessage,
  SavedMessage,
} from '@/features/channels/contracts'
import type { MessageAction } from '@/features/channels/components/ChannelMessageActions.vue'
import { TeaButton, TeaDialog, TeaTextarea } from '@/shared/ui'
import ChannelActionConfirmDialog from '@/features/channels/components/ChannelActionConfirmDialog.vue'
import ChannelForwardDialog from '@/features/channels/components/ChannelForwardDialog.vue'
import ChannelReactionDialog from '@/features/channels/components/ChannelReactionDialog.vue'
import ChannelDetailsDialog from '@/features/channels/components/ChannelDetailsDialog.vue'
import ChannelMessageSearchDialog from '@/features/channels/components/ChannelMessageSearchDialog.vue'
import ChannelPinnedMessagesDialog from '@/features/channels/components/ChannelPinnedMessagesDialog.vue'
import ChannelSavedMessagesDialog from '@/features/channels/components/ChannelSavedMessagesDialog.vue'
import ChannelMergedMessagesDialog from '@/features/channels/components/ChannelMergedMessagesDialog.vue'
import ChannelReceiptDetailsDialog from '@/features/channels/components/ChannelReceiptDetailsDialog.vue'
import { useChannelMessageSelection } from '@/features/channels/useChannelMessageSelection'
import { useChannelMergedMessageViewer } from '@/features/channels/useChannelMergedMessageViewer'

const {
  centerAuth,
  channels,
  collaboration,
  agentDrawer,
  settings,
  managedRuntime,
  activeAgentDrawerState,
  roleOptions,
  collaborationModelOptions,
  recentCollaborationConversations,
  currentChannelSessionAvailable,
  collaborationErrorText,
  selectCollaborationConversation,
  createCollaborationConversation,
  expandCollaboration,
  forwardToAgent,
  refreshManagedWorkspace,
  openDraftEditor,
  selectCollaborationModel,
  selectCollaborationPermission,
  selectCollaborationRole,
  applyCollaborationRolePrompt,
  sendCollaborationMessage,
} = useTeaDesktopAppContext()
const { t } = useI18n()
const replyTo = ref<Message | null>(null)
const channelAttachments = ref<ChannelAttachment[]>([])
const editingMessage = ref<Message | null>(null)
const pendingAction = ref<'revoke' | 'delete' | null>(null)
const forwardingMessages = shallowRef<Message[]>([])
const forwardingMode = ref<ForwardMessageMode>('individual')
const forwardingSourceChannelName = ref<string | undefined>()
const forwardingIdempotencyKey = ref<string | undefined>()
const reactingMessage = ref<Message | null>(null)
const actionPending = ref(false)
const editDraft = ref('')
const detailsOpen = ref(false)
const channelDetails = ref<ChannelDetails | null>(null)
const channelMembers = ref<ChannelMember[]>([])
const memberCursor = ref<string | undefined>()
const membersHasMore = ref(false)
const detailsLoading = ref(false)
const detailsErrorCode = ref<string | null>(null)
const searchOpen = ref(false)
const searchScope = ref<ChannelRef | null>(null)
const pinnedOpen = ref(false)
const savedOpen = ref(false)
const pendingSavedRemoval = ref<SavedMessage | null>(null)
const mentionMembers = shallowRef<ChannelMember[]>([])
const mentionMembersChannelRef = ref<ChannelRef | null>(null)
const mentionMembersLoading = ref(false)
const receiptDetailsOpen = ref(false)
const receiptDetailsMessage = ref<Message | null>(null)
const receiptDetails = ref<MessageReceiptDetails | null>(null)
const receiptDetailsLoading = ref(false)
const receiptDetailsErrorCode = ref<string | null>(null)
let detailsGeneration = 0
let mentionMembersGeneration = 0
let receiptDetailsGeneration = 0

const {
  active: selectingMessages,
  selectedKeys: selectedMessageKeys,
  selectedMessages,
  individualEligibility,
  mergedEligibility,
  begin: beginMessageSelection,
  toggle: toggleMessageSelection,
  selectAllVisible: selectAllVisibleMessages,
  clear: clearMessageSelection,
} = useChannelMessageSelection(
  computed(() => channels.activeMessages),
  computed(() => channels.activeChannelRef),
)
const {
  open: mergedViewerOpen,
  currentMessage: mergedViewerMessage,
  items: mergedViewerItems,
  loading: mergedViewerLoading,
  errorCode: mergedViewerErrorCode,
  canGoBack: mergedViewerCanGoBack,
  openMessage: openMergedMessage,
  retry: retryMergedMessage,
  back: backMergedMessage,
  close: closeMergedViewer,
} = useChannelMergedMessageViewer((messageRef) => channels.loadMergedMessages(messageRef))

const reactionOptions = [
  { type: 1, label: '👍' },
  { type: 2, label: '❤️' },
  { type: 3, label: '😂' },
  { type: 4, label: '🎉' },
  { type: 5, label: '🙏' },
  { type: 6, label: '👀' },
] as const

function handleChannelSelect(channelRef: ChannelRef): void {
  mentionMembersGeneration += 1
  mentionMembers.value = []
  mentionMembersChannelRef.value = null
  mentionMembersLoading.value = false
  closeReceiptDetails()
  channelAttachments.value = []
  replyTo.value = null
  searchOpen.value = false
  searchScope.value = null
  pinnedOpen.value = false
  closeForwarding()
  closeMergedViewer()
  channels.clearMessageSearch()
  void channels.selectChannel(channelRef).catch(() => undefined)
}

function setChannelPinned(channelRef: ChannelRef, pinned: boolean): void {
  void channels.setChannelPinned(channelRef, pinned).catch(() => undefined)
}

function setChannelMuted(channelRef: ChannelRef, muted: boolean): void {
  void channels.setChannelMuted(channelRef, muted).catch(() => undefined)
}

function markChannelRead(channelRef: ChannelRef): void {
  void channels.markChannelRead(channelRef).catch(() => undefined)
}

function hideChannel(channelRef: ChannelRef): void {
  void channels.hideChannel(channelRef).catch(() => undefined)
}

function openMessageSearch(): void {
  searchScope.value = channels.activeChannel?.ref ?? null
  channels.clearMessageSearch()
  searchOpen.value = true
}

function openGlobalMessageSearch(): void {
  searchScope.value = null
  channels.clearMessageSearch()
  searchOpen.value = true
}

function openSavedMessages(): void {
  savedOpen.value = true
  void channels.loadSavedMessages().catch(() => undefined)
}

function retrySavedMessages(): void {
  void channels.loadSavedMessages().catch(() => undefined)
}

function loadMoreSavedMessages(): void {
  void channels.loadMoreSavedMessages().catch(() => undefined)
}

async function selectSavedMessage(item: SavedMessage): Promise<void> {
  try {
    await channels.jumpToMessage(item.message.ref)
    savedOpen.value = false
  } catch {
    // Preserve the catalog and store error so the user can retry or remove the snapshot.
  }
}

function forwardSavedMessage(item: SavedMessage): void {
  openForwarding([item.message], 'individual', item.sourceChannelName)
  savedOpen.value = false
}

async function stageSavedMessage(item: SavedMessage): Promise<void> {
  try {
    await forwardToAgent({ message: item.message, action: 'current' })
    savedOpen.value = false
  } catch {
    // Collaboration state owns and renders any runtime failure.
  }
}

async function confirmRemoveSavedMessage(): Promise<void> {
  const item = pendingSavedRemoval.value
  if (!item) return
  try {
    await channels.removeSavedMessage(item.id)
    pendingSavedRemoval.value = null
  } catch {
    // Keep the confirmation open and expose the stable store error.
  }
}

function searchChannelMessages(keyword: string): void {
  void channels.searchMessages(keyword, searchScope.value).catch(() => undefined)
}

function loadMoreSearchMessages(): void {
  void channels.loadMoreSearchMessages().catch(() => undefined)
}

async function selectSearchResult(message: Message): Promise<void> {
  try {
    await channels.jumpToMessage(message.ref)
    searchOpen.value = false
  } catch {
    // Preserve the store error state for the connection/error surface.
  }
}

function openPinnedMessages(): void {
  pinnedOpen.value = true
  void channels.loadPinnedMessages().catch(() => undefined)
}

function retryPinnedMessages(): void {
  void channels.loadPinnedMessages().catch(() => undefined)
}

async function selectPinnedMessage(item: PinnedMessage): Promise<void> {
  try {
    await channels.jumpToMessage(item.message.ref)
    pinnedOpen.value = false
  } catch {
    // Preserve the store error state for the connection/error surface.
  }
}

async function handleChannelSend(payload: {
  text: string
  replyTo: Message | null
  attachments: ChannelAttachment[]
  mentions: MessageMention[]
}): Promise<void> {
  try {
    let replyRef = payload.replyTo?.ref
    if (payload.text) {
      await channels.sendText(payload.text, replyRef, payload.mentions)
      replyRef = undefined
    }
    for (const attachment of payload.attachments) {
      await channels.sendContent(
        {
          kind: attachment.kind,
          media: {
            source: { kind: 'localFile', token: attachment.token },
            name: attachment.name,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          },
        },
        replyRef,
      )
      channelAttachments.value = channelAttachments.value.filter(
        (candidate) => candidate.token !== attachment.token,
      )
      replyRef = undefined
    }
    replyTo.value = null
  } catch {
    // The store exposes the stable error code to the connection panel.
  }
}

async function loadMentionMembers(): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group') return
  if (mentionMembersChannelRef.value === channel.ref && mentionMembers.value.length) return
  const operation = ++mentionMembersGeneration
  mentionMembersChannelRef.value = channel.ref
  mentionMembersLoading.value = true
  mentionMembers.value = []
  try {
    const members = new Map<string, ChannelMember>()
    let cursor: string | undefined
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await channels.listChannelMembers({
        channelRef: channel.ref,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      })
      if (operation !== mentionMembersGeneration || channels.activeChannelRef !== channel.ref)
        return
      page.items.forEach((member) => members.set(member.accountId, member))
      mentionMembers.value = [...members.values()]
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
  } catch {
    // The channel store exposes the stable transport error code.
  } finally {
    if (operation === mentionMembersGeneration) mentionMembersLoading.value = false
  }
}

function closeReceiptDetails(): void {
  receiptDetailsGeneration += 1
  receiptDetailsOpen.value = false
  receiptDetailsMessage.value = null
  receiptDetails.value = null
  receiptDetailsLoading.value = false
  receiptDetailsErrorCode.value = null
}

async function openReceiptDetails(message: Message): Promise<void> {
  const operation = ++receiptDetailsGeneration
  receiptDetailsOpen.value = true
  receiptDetailsMessage.value = message
  receiptDetails.value = null
  receiptDetailsLoading.value = true
  receiptDetailsErrorCode.value = null
  try {
    const details = await channels.getMessageReceiptDetails(message.ref)
    if (operation === receiptDetailsGeneration) receiptDetails.value = details
  } catch (error) {
    if (operation === receiptDetailsGeneration)
      receiptDetailsErrorCode.value =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'transport'
  } finally {
    if (operation === receiptDetailsGeneration) receiptDetailsLoading.value = false
  }
}

function retryReceiptDetails(): void {
  if (receiptDetailsMessage.value) void openReceiptDetails(receiptDetailsMessage.value)
}

async function pickChannelAttachments(): Promise<void> {
  try {
    const selected = await channels.pickAttachments()
    const known = new Set(channelAttachments.value.map((attachment) => attachment.token))
    channelAttachments.value = [
      ...channelAttachments.value,
      ...selected.filter((attachment) => !known.has(attachment.token)),
    ].slice(0, 10)
  } catch {
    // Preserve the store error state.
  }
}

function removeChannelAttachment(token: string): void {
  channelAttachments.value = channelAttachments.value.filter(
    (attachment) => attachment.token !== token,
  )
}

function handleLoadMoreChannels(): void {
  void channels.loadOlderMessages().catch(() => undefined)
}

function handleLoadNewerChannels(): void {
  void channels.loadNewerMessages().catch(() => undefined)
}

function handleRefreshChannelMessages(): void {
  void channels.loadNewerMessages(true).catch(() => undefined)
}

function handleMessageAction(payload: { message: Message; action: MessageAction }): void {
  if (payload.action === 'reply') replyTo.value = payload.message
  else if (payload.action === 'forward')
    openForwarding([payload.message], 'individual', channels.activeChannel?.name)
  else if (payload.action === 'select') beginMessageSelection(payload.message)
  else if (payload.action === 'reaction') reactingMessage.value = payload.message
  else if (payload.action === 'edit') {
    editingMessage.value = payload.message
    editDraft.value = payload.message.text
  } else if (payload.action === 'pin') {
    void channels.pinMessage(payload.message.ref, !payload.message.pinned).catch(() => undefined)
  } else if (payload.action === 'save') {
    void channels
      .saveMessage(payload.message.ref, channels.activeChannel?.name)
      .catch(() => undefined)
  } else if (payload.action === 'revoke' || payload.action === 'delete') {
    pendingAction.value = payload.action
    pendingMessage.value = payload.message
  }
}

const pendingMessage = ref<Message | null>(null)

function closePendingAction(): void {
  if (actionPending.value) return
  pendingAction.value = null
  pendingMessage.value = null
}

async function confirmPendingAction(): Promise<void> {
  if (!pendingMessage.value || !pendingAction.value) return
  actionPending.value = true
  try {
    if (pendingAction.value === 'revoke') await channels.revokeMessage(pendingMessage.value.ref)
    else await channels.deleteMessages([pendingMessage.value.ref])
    closePendingAction()
  } catch {
    // Preserve the store error state so the existing connection/error surface can render it.
  } finally {
    actionPending.value = false
  }
}

async function saveEdit(): Promise<void> {
  if (!editingMessage.value || !editDraft.value.trim()) return
  actionPending.value = true
  try {
    await channels.modifyMessage(editingMessage.value.ref, editDraft.value)
    editingMessage.value = null
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

function openForwarding(
  messages: Message[],
  mode: ForwardMessageMode,
  sourceChannelName?: string,
): void {
  forwardingMessages.value = structuredClone(messages)
  forwardingMode.value = mode
  forwardingSourceChannelName.value = sourceChannelName
  forwardingIdempotencyKey.value = crypto.randomUUID()
}

function closeForwarding(): void {
  if (actionPending.value) return
  forwardingMessages.value = []
  forwardingSourceChannelName.value = undefined
  forwardingIdempotencyKey.value = undefined
}

function forwardSelection(mode: ForwardMessageMode): void {
  const eligibility = mode === 'individual' ? individualEligibility.value : mergedEligibility.value
  if (!eligibility.eligible) return
  openForwarding(selectedMessages.value, mode, channels.activeChannel?.name)
}

async function confirmForward(payload: {
  channelRefs: string[]
  mode: ForwardMessageMode
  comment?: string
}): Promise<void> {
  if (!forwardingMessages.value.length) return
  actionPending.value = true
  try {
    await channels.forwardMessage({
      messageRefs: forwardingMessages.value.map((message) => message.ref),
      targetChannelRefs: payload.channelRefs,
      mode: payload.mode,
      ...(forwardingSourceChannelName.value
        ? { sourceChannelName: forwardingSourceChannelName.value }
        : {}),
      ...(payload.comment ? { comment: payload.comment } : {}),
      ...(forwardingIdempotencyKey.value ? { idempotencyKey: forwardingIdempotencyKey.value } : {}),
    })
    forwardingMessages.value = []
    forwardingSourceChannelName.value = undefined
    forwardingIdempotencyKey.value = undefined
    clearMessageSelection()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

async function selectReaction(type: number, active: boolean): Promise<void> {
  if (!reactingMessage.value) return
  actionPending.value = true
  try {
    await channels.quickComment({ messageRef: reactingMessage.value.ref, type, active })
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

function closeDetails(): void {
  detailsOpen.value = false
  detailsGeneration += 1
}

async function loadChannelDetails(): Promise<void> {
  const channel = channels.activeChannel
  if (!channel) return
  const operation = ++detailsGeneration
  detailsOpen.value = true
  detailsLoading.value = true
  detailsErrorCode.value = null
  channelDetails.value = null
  channelMembers.value = []
  memberCursor.value = undefined
  membersHasMore.value = false
  try {
    const details = await channels.getChannelDetails(channel.ref)
    if (operation !== detailsGeneration) return
    channelDetails.value = details
    if (channel.kind === 'group') await loadMoreMembers(operation, channel.ref)
  } catch (error) {
    if (operation === detailsGeneration) {
      detailsErrorCode.value =
        error instanceof Error && 'code' in error ? String(error.code) : 'transport'
    }
  } finally {
    if (operation === detailsGeneration) detailsLoading.value = false
  }
}

async function loadMoreMembers(
  operation = detailsGeneration,
  channelRef = channels.activeChannel?.ref,
): Promise<void> {
  if (
    !channelRef ||
    channels.activeChannel?.kind !== 'group' ||
    (memberCursor.value === undefined && channelMembers.value.length > 0) ||
    (memberCursor.value && !membersHasMore.value)
  )
    return
  try {
    const page = await channels.listChannelMembers({
      channelRef,
      limit: 50,
      cursor: memberCursor.value,
    })
    if (operation !== detailsGeneration) return
    channelMembers.value = [...channelMembers.value, ...page.items]
    memberCursor.value = page.nextCursor
    membersHasMore.value = page.hasMore
  } catch (error) {
    if (operation === detailsGeneration)
      detailsErrorCode.value =
        error instanceof Error && 'code' in error ? String(error.code) : 'transport'
  }
}

async function updateActiveGroup(payload: {
  name: string
  description: string
  announcement: string
}): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group') return
  actionPending.value = true
  try {
    await channels.updateGroup({ channelRef: channel.ref, ...payload })
    await loadChannelDetails()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

async function inviteGroupMembers(accountIds: string[]): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group') return
  actionPending.value = true
  try {
    await channels.inviteGroupMembers({ channelRef: channel.ref, accountIds })
    await loadChannelDetails()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

async function removeGroupMember(accountId: string): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group') return
  actionPending.value = true
  try {
    await channels.removeGroupMembers({ channelRef: channel.ref, accountIds: [accountId] })
    await loadChannelDetails()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

async function toggleGroupMemberMute(member: ChannelMember): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group') return
  actionPending.value = true
  try {
    await channels.setGroupMemberMute({
      channelRef: channel.ref,
      accountId: member.accountId,
      chatBanned: !member.chatBanned,
    })
    await loadChannelDetails()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}

async function toggleGroupMemberRole(member: ChannelMember): Promise<void> {
  const channel = channels.activeChannel
  if (!channel || channel.kind !== 'group' || member.role === 'owner') return
  actionPending.value = true
  try {
    await channels.setGroupMemberRole({
      channelRef: channel.ref,
      accountIds: [member.accountId],
      role: member.role === 'manager' ? 'member' : 'manager',
    })
    await loadChannelDetails()
  } catch {
    // Preserve the store error state.
  } finally {
    actionPending.value = false
  }
}
</script>

<template>
  <ChannelSidebar
    :channels="channels.channels"
    :active-ref="channels.activeChannelRef"
    :status="channels.status"
    :loading="channels.loadingChannels"
    :pending-refs="channels.pendingChannelRefs"
    @select="handleChannelSelect"
    @open-search="openGlobalMessageSearch"
    @open-saved="openSavedMessages"
    @pin="setChannelPinned"
    @mute="setChannelMuted"
    @mark-read="markChannelRead"
    @hide="hideChannel"
  />
  <ChannelTimeline
    v-if="channels.activeChannel"
    :channel="channels.activeChannel"
    :messages="channels.activeMessages"
    :highlighted-message-key="channels.highlightedMessageKey"
    :panel-open="settings.agentDrawerOpen"
    :loading="channels.loadingMessages"
    :has-more="channels.activeHasMoreMessages"
    :has-more-newer="channels.activeHasMoreNewerMessages"
    :sending="channels.sendingMessage"
    :reply-to="replyTo"
    :attachments="channelAttachments"
    :sending-progress="channels.sendingProgress"
    :active-conversation="collaboration.activeConversation"
    :recent-conversations="recentCollaborationConversations"
    :current-session-available="currentChannelSessionAvailable"
    :runtimes="collaboration.runtimes"
    :default-runtime-id="settings.defaultRuntimeId"
    :selection-mode="selectingMessages"
    :selected-message-keys="selectedMessageKeys"
    :selected-count="selectedMessages.length"
    :can-forward-individual="individualEligibility.eligible"
    :can-forward-merged="mergedEligibility.eligible"
    :mention-members="mentionMembers"
    :mention-members-loading="mentionMembersLoading"
    @forward-to-agent="forwardToAgent"
    @message-action="handleMessageAction"
    @send="handleChannelSend"
    @pick-attachments="pickChannelAttachments"
    @remove-attachment="removeChannelAttachment"
    @cancel-reply="replyTo = null"
    @load-more="handleLoadMoreChannels"
    @load-newer="handleLoadNewerChannels"
    @refresh-messages="handleRefreshChannelMessages"
    @open-search="openMessageSearch"
    @open-pinned="openPinnedMessages"
    @show-details="loadChannelDetails"
    @toggle-panel="settings.toggleAgentDrawer()"
    @toggle-message-selection="toggleMessageSelection"
    @select-all-visible="selectAllVisibleMessages"
    @cancel-selection="clearMessageSelection"
    @forward-selection="forwardSelection"
    @open-merged="openMergedMessage"
    @request-mention-members="loadMentionMembers"
    @open-receipt-details="openReceiptDetails"
  />
  <ChannelSelectionPlaceholder
    v-else-if="channels.status.phase === 'connected' && channels.channels.length > 0"
  />
  <ChannelConnectionPanel
    v-else
    :status="channels.status"
    :error-code="
      channels.errorCode ||
      managedRuntime.state.im?.errorCode ||
      managedRuntime.state.errorCode ||
      null
    "
    :managed-phase="managedRuntime.state.phase"
    :im-status="managedRuntime.state.im?.status"
    :channels-loading="channels.loadingChannels"
    :pending="centerAuth.pending || managedRuntime.pending"
    @retry="refreshManagedWorkspace"
  />
  <AgentDrawer
    v-if="channels.activeChannel && activeAgentDrawerState"
    :open="settings.agentDrawerOpen"
    :state="activeAgentDrawerState"
    :conversations="collaboration.conversations"
    :runtimes="collaboration.runtimes"
    :default-runtime-id="settings.defaultRuntimeId"
    :turns="collaboration.turns"
    :collaboration="collaboration.collaboration"
    :model-options="collaborationModelOptions"
    :roles="roleOptions"
    :loading="collaboration.loading"
    :sending="collaboration.sending"
    :streaming="collaboration.isStreaming"
    :error="collaborationErrorText"
    @close="settings.closeAgentDrawer()"
    @select="selectCollaborationConversation"
    @create="createCollaborationConversation()"
    @create-with-runtime="createCollaborationConversation($event)"
    @view-all="agentDrawer.setListMode(collaboration.activeBinding!, 'all')"
    @update-query="agentDrawer.setQuery(collaboration.activeBinding!, $event)"
    @update-text="agentDrawer.updateDraft(collaboration.activeBinding!, { text: $event })"
    @update-attachments="
      agentDrawer.updateDraft(collaboration.activeBinding!, { attachments: $event })
    "
    @send="sendCollaborationMessage($event.text)"
    @stop="collaboration.cancel()"
    @back="agentDrawer.back(collaboration.activeBinding!)"
    @expand="expandCollaboration"
    @remove-source="collaboration.removeStagedSource($event)"
    @create-draft="openDraftEditor"
    @resolve-approval="collaboration.respondToApproval($event.approvalId, $event.decision)"
    @select-runtime="collaboration.selectRuntime($event)"
    @select-model="selectCollaborationModel"
    @select-permission="selectCollaborationPermission"
    @select-role="selectCollaborationRole"
    @apply-role-prompt="applyCollaborationRolePrompt"
  />
  <ChannelMessageSearchDialog
    v-if="searchOpen || channels.activeChannel"
    :open="searchOpen"
    :channel-name="
      searchScope ? channels.activeChannel?.name || searchScope : t('channels.allChannels')
    "
    :channels="channels.channels"
    :state="channels.messageSearch"
    @close="searchOpen = false"
    @search="searchChannelMessages"
    @load-more="loadMoreSearchMessages"
    @select="selectSearchResult"
  />
  <ChannelPinnedMessagesDialog
    v-if="channels.activeChannel"
    :open="pinnedOpen"
    :channel-name="channels.activeChannel.name"
    :items="channels.pinnedMessages"
    :loading="channels.loadingPinnedMessages"
    :error-code="channels.pinnedMessagesErrorCode"
    @close="pinnedOpen = false"
    @retry="retryPinnedMessages"
    @select="selectPinnedMessage"
  />
  <ChannelSavedMessagesDialog
    :open="savedOpen"
    :items="channels.savedMessages"
    :total-count="channels.savedMessagesTotalCount"
    :loading="channels.loadingSavedMessages"
    :loading-more="channels.loadingMoreSavedMessages"
    :has-more="channels.savedMessagesHasMore"
    :error-code="channels.savedMessagesErrorCode"
    :removing-id="channels.removingSavedMessageId"
    @close="savedOpen = false"
    @retry="retrySavedMessages"
    @load-more="loadMoreSavedMessages"
    @select="selectSavedMessage"
    @forward="forwardSavedMessage"
    @stage-agent="stageSavedMessage"
    @remove="pendingSavedRemoval = $event"
  />
  <ChannelActionConfirmDialog
    :open="pendingSavedRemoval !== null"
    :title="t('channels.saved.removeConfirmTitle')"
    :description="t('channels.saved.removeConfirmDescription')"
    :confirm-label="t('channels.saved.remove')"
    :cancel-label="t('channels.message.cancel')"
    :pending="channels.removingSavedMessageId !== null"
    danger
    @close="pendingSavedRemoval = null"
    @confirm="confirmRemoveSavedMessage"
  />
  <ChannelActionConfirmDialog
    :open="pendingAction !== null"
    :title="
      pendingAction === 'revoke'
        ? t('channels.message.revokeConfirmTitle')
        : t('channels.message.deleteConfirmTitle')
    "
    :description="
      pendingAction === 'revoke'
        ? t('channels.message.revokeConfirmDescription')
        : t('channels.message.deleteConfirmDescription')
    "
    :confirm-label="
      pendingAction === 'revoke' ? t('channels.message.revoke') : t('channels.message.delete')
    "
    :cancel-label="t('channels.message.cancel')"
    :pending="actionPending"
    :danger="pendingAction === 'delete'"
    @close="closePendingAction"
    @confirm="confirmPendingAction"
  />
  <TeaDialog
    :open="editingMessage !== null"
    :title="t('channels.message.editTitle')"
    width="small"
    dismissable
    @close="editingMessage = null"
  >
    <TeaTextarea
      v-model="editDraft"
      :label="t('channels.message.editLabel')"
      :placeholder="t('channels.message.editLabel')"
      auto-grow
      :rows="4"
    />
    <template #footer>
      <TeaButton :disabled="actionPending" @click="editingMessage = null">
        {{ t('channels.message.cancel') }}
      </TeaButton>
      <TeaButton
        appearance="primary"
        :loading="actionPending"
        :disabled="!editDraft.trim()"
        @click="saveEdit"
      >
        {{ t('channels.message.saveEdit') }}
      </TeaButton>
    </template>
  </TeaDialog>
  <ChannelForwardDialog
    :open="forwardingMessages.length > 0"
    :messages="forwardingMessages"
    :channels="channels.channels"
    :initial-mode="forwardingMode"
    :pending="actionPending"
    @close="closeForwarding"
    @confirm="confirmForward"
  />
  <ChannelMergedMessagesDialog
    :open="mergedViewerOpen"
    :message="mergedViewerMessage"
    :items="mergedViewerItems"
    :loading="mergedViewerLoading"
    :error-code="mergedViewerErrorCode"
    :can-go-back="mergedViewerCanGoBack"
    @close="closeMergedViewer"
    @retry="retryMergedMessage"
    @back="backMergedMessage"
    @open-merged="openMergedMessage"
  />
  <ChannelReactionDialog
    :open="reactingMessage !== null"
    :message="reactingMessage"
    :options="reactionOptions"
    :title="t('channels.message.reactionTitle')"
    :close-label="t('channels.message.cancel')"
    :pending="actionPending"
    @close="reactingMessage = null"
    @select="selectReaction"
  />
  <ChannelReceiptDetailsDialog
    :open="receiptDetailsOpen"
    :details="receiptDetails"
    :loading="receiptDetailsLoading"
    :error-code="receiptDetailsErrorCode"
    @close="closeReceiptDetails"
    @retry="retryReceiptDetails"
  />
  <ChannelDetailsDialog
    :open="detailsOpen"
    :channel="channels.activeChannel"
    :details="channelDetails"
    :members="channelMembers"
    :loading="detailsLoading"
    :has-more="membersHasMore"
    :error-code="detailsErrorCode"
    :action-pending="actionPending"
    @close="closeDetails"
    @retry="loadChannelDetails"
    @load-more="loadMoreMembers()"
    @update-group="updateActiveGroup"
    @invite-members="inviteGroupMembers"
    @remove-member="removeGroupMember"
    @toggle-member-mute="toggleGroupMemberMute"
    @toggle-member-role="toggleGroupMemberRole"
  />
</template>

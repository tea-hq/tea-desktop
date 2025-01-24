<template>
  <div class="conversation-wrapper" :class="{ 'stick-top': props.stickTop }">
    <a-list-item class="conversation-item">
      <a-list-item-meta>
        <template #avatar>
          <a-avatar v-if="props.avatar" :src="props.avatar" />
          <a-avatar v-else><template #icon><UserOutlined /></template></a-avatar>
        </template>
        <template #title>
          <a-tooltip :title="props.conversationId">
            <span>{{ props.name }}</span>
          </a-tooltip>
        </template>
        <template #description>{{ props.lastMessage?.text }}</template>
      </a-list-item-meta>
      <div class="conversation-right">
        <div class="conversation-time">{{ formatTime(Number(props.updateTime)) }}</div>
        <div class="conversation-status">
          <AudioMutedOutlined v-if="props.mute" class="mute-icon" />
          <a-badge 
            v-if="props.unreadCount > 0" 
            :count="props.unreadCount"
            :class="{ 'muted-badge': props.mute }"
          />
        </div>
      </div>
    </a-list-item>
    <div class="conversation-actions">
      <a-tooltip :title="props.mute ? '取消免打扰' : '设置免打扰'">
        <a-button type="text" size="small" @click="handleMuteToggle">
          <template #icon>
            <AudioMutedOutlined v-if="props.mute" />
            <AudioOutlined v-else />
          </template>
        </a-button>
      </a-tooltip>
      <a-tooltip :title="props.stickTop ? '取消置顶' : '置顶'">
        <a-button type="text" size="small" @click="handleStickTop">
          <template #icon><PushpinOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip title="清空未读">
        <a-button type="text" size="small" @click="handleClearUnread">
          <template #icon><CheckOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip title="删除">
        <a-button type="text" size="small" danger @click="handleDelete">
          <template #icon><DeleteOutlined /></template>
        </a-button>
      </a-tooltip>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  UserOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  PushpinOutlined,
  CheckOutlined,
  DeleteOutlined
} from '@ant-design/icons-vue'
import { V2NIMLastMessage } from 'node-nim/types/v2_def/v2_nim_struct_def'
import { v2 } from 'node-nim'

interface Props {
  conversationId: string
  type: number
  name: string
  avatar: string | null
  lastMessage: V2NIMLastMessage | undefined
  updateTime: string | number
  unreadCount: number
  mute: boolean | undefined
  stickTop?: boolean
}

const formatTime = (time: number) => {
  try {
    const date =
      typeof time === "string" ? new Date(parseInt(time)) : new Date(time);
    const now = new Date();

    // 如果是今天的消息，只显示时间
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // 如果是昨天的消息
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "昨天";
    }

    // 其他日期显示完整日期
    return date.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'muteToggle', conversationId: string): void
  (e: 'stickTop', conversationId: string): void
  (e: 'clearUnread', conversationId: string): void
  (e: 'delete', conversationId: string): void
}>()

const handleMuteToggle = () => {
  try {
    const targetId = v2.conversationIdUtil?.parseConversationTargetId(props.conversationId)
    if (!targetId) return
    
    if (props.type == 1) {
      v2.settingService?.setP2PMessageMuteMode(targetId, props.mute ? 0 : 1)
    } else {
      const teamType = v2.conversationIdUtil?.parseConversationType(props.conversationId) == 2 ? 1 : 2
      v2.settingService?.setTeamMessageMuteMode(targetId, teamType, props.mute ? 0 : 1)
    }
  } catch (error) {
    console.error('设置静音失败:', error)
  }
  emit('muteToggle', props.conversationId)
}

const handleStickTop = async () => {
  try {
    await v2.localConversationService?.stickTopConversation(props.conversationId, !props.stickTop)
    emit('stickTop', props.conversationId)
  } catch (error) {
    console.error('设置置顶失败:', error)
  }
}

const handleClearUnread = () => {
  try {
    v2.localConversationService?.clearUnreadCountByIds([props.conversationId])
    emit('clearUnread', props.conversationId)
  } catch (error) {
    console.error('清空未读失败:', error)
  }
}

const handleDelete = () => {
  try {
    v2.localConversationService?.deleteConversation(props.conversationId, false)
    emit('delete', props.conversationId)
  } catch (error) {
    console.error('删除会话失败:', error)
  }
}
</script>

<style scoped>
.conversation-wrapper {
  position: relative;
}

.stick-top {
  background-color: #dfdfdf;
}

.stick-top .conversation-item:hover {
  background-color: #f0f0f0;
}

.conversation-wrapper:hover .conversation-actions {
  opacity: 1;
}

.conversation-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 4px;
  background-color: rgba(0, 0, 0, 0.02);
  opacity: 0;
  transition: opacity 0.2s;
}

.conversation-item {
  padding: 10px;
  cursor: pointer;
}

.conversation-item:hover {
  background: #e6f7ff;
}

.conversation-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.muted-badge :deep(.ant-badge-count) {
  background-color: #999999 !important;
}

.conversation-status {
  min-height: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
<template>
  <div class="conversation-list">
    <div class="conversation-header">
      <a-input-search
        placeholder="搜索"
        style="width: 100%"
        v-model:value="searchText"
      />
    </div>
    <div class="conversation-content">
      <a-tabs v-model:activeKey="activeTab">
        <template v-for="tab in tabs" :key="tab.key">
          <a-tab-pane :tab="tab.label">
            <div class="conversation-scroll">
              <a-list :data-source="filteredConversations">
                <template #renderItem="{ item }">
                  <ConversationItem
                    :key="item.conversationId"
                    :conversationId="item.conversationId"
                    :type="item.type"
                    :name="item.name"
                    :avatar="item.avatar"
                    :lastMessage="item.lastMessage"
                    :updateTime="item.updateTime"
                    :unreadCount="item.unreadCount"
                    :mute="item.mute"
                    :stickTop="item.stickTop"
                  />
                </template>
              </a-list>
            </div>
          </a-tab-pane>
        </template>
      </a-tabs>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { V2NIMLocalConversation, V2NIMLocalConversationFilter } from "node-nim/types/v2_def/v2_nim_struct_def";
import { v2 } from "node-nim";
import ConversationItem from "./ConversationItem.vue";

const searchText = ref("");
const conversationList = ref<V2NIMLocalConversation[]>([]);

const sortConversations = (conversations: V2NIMLocalConversation[]) => {
  const result = conversations.sort((a, b) => (Number(b.sortOrder) || 0) - (Number(a.sortOrder) || 0))
  return result
}

const getAllConversations = async () => {
  let allConversations: V2NIMLocalConversation[] = []
  let offset = 0
  const limit = 100

  while (true) {
    try {
      const result = await v2.localConversationService?.getConversationList(offset, limit)
      if (!result) break
      console.log(result)
      allConversations = [...allConversations, ...result.conversationList]
      if (result.finished) break
      offset += limit
    } catch (error) {
      console.error("获取会话列表失败:", error)
      break
    }
  }

  return allConversations
}

onMounted(() => {
  v2.localConversationService?.on("syncFinished", async () => {
    try {
      const conversations = await getAllConversations()
      conversationList.value = sortConversations(conversations)
    } catch (error) {
      console.error("Failed to get conversation list:", error)
    }
  })
  v2.localConversationService?.on("conversationCreated", async (conversation: V2NIMLocalConversation) => {
    conversationList.value = sortConversations([...conversationList.value, conversation])
  })
  v2.localConversationService?.on("conversationChanged", async (conversations: Array<V2NIMLocalConversation>) => {
    const updatedList = [...conversationList.value]
    conversations.forEach((conversation) => {
      const index = updatedList.findIndex(
        (item: V2NIMLocalConversation) => item.conversationId === conversation.conversationId
      )
      if (index !== -1) {
        updatedList[index] = conversation
      }
    })
    conversationList.value = sortConversations(updatedList)
  })
  v2.localConversationService?.on("conversationDeleted", async (conversationIds: string[]) => {
    conversationList.value = conversationList.value.filter(
      (conversation: V2NIMLocalConversation) => !conversationIds.includes(conversation.conversationId)
    )
  })
  v2.localConversationService?.on('totalUnreadCountChanged', async (count: number) => {
    unreadCounts.value.total = count
  })
  v2.localConversationService?.on('unreadCountChangedByFilter', async (filter: V2NIMLocalConversationFilter, count: number) => {
    console.log(filter, count)
    if (filter.conversationTypes?.includes(1)) {
      unreadCounts.value.p2p = count
    }
    if (filter.conversationTypes?.includes(2) && filter.conversationTypes?.includes(3)) {
      unreadCounts.value.team = count
    }
  })
  v2.localConversationService?.subscribeUnreadCountByFilter({
    conversationTypes: [1],
    ignoreMuted: true
  })
  v2.localConversationService?.subscribeUnreadCountByFilter({
    conversationTypes: [2, 3],
    ignoreMuted: true
  })
})

onUnmounted(() => {
  v2.localConversationService?.off("syncFinished")
  v2.localConversationService?.off("conversationCreated")
  v2.localConversationService?.off("conversationChanged")
  v2.localConversationService?.off("conversationDeleted")
  v2.localConversationService?.off('totalUnreadCountChanged')
  v2.localConversationService?.off('unreadCountChangedByFilter')
  v2.localConversationService?.unsubscribeUnreadCountByFilter({
    conversationTypes: [1],
    ignoreMuted: true
  })
  v2.localConversationService?.unsubscribeUnreadCountByFilter({
    conversationTypes: [2, 3],
    ignoreMuted: true
  })
})

const activeTab = ref('all')

const filteredConversations = computed(() => {
  switch (activeTab.value) {
    case 'p2p':
      return conversationList.value.filter((conversation: V2NIMLocalConversation) => conversation.type === 1)
    case 'team':
      return conversationList.value.filter((conversation: V2NIMLocalConversation) => conversation.type === 2 || conversation.type === 3)
    default:
      return conversationList.value
  }
})

const tabs = computed(() => [{
  key: 'all', 
  label: `全部${unreadCounts.value.total ? `(${unreadCounts.value.total})` : ''}`
}, { 
  key: 'p2p', 
  label: `私聊${unreadCounts.value.p2p ? `(${unreadCounts.value.p2p})` : ''}`
}, { 
  key: 'team', 
  label: `群聊${unreadCounts.value.team ? `(${unreadCounts.value.team})` : ''}`
}])

// 未读数接口
const unreadCounts = ref({
  total: 0,
  p2p: 0,
  team: 0
})

</script>

<style scoped>
.conversation-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.conversation-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 关键修改 */
}

:deep(.ant-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.ant-tabs-content) {
  height: 100%;
  flex: 1;
}

:deep(.ant-tabs-tabpane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.conversation-header {
  padding: 10px;
  border-bottom: 1px solid #d9d9d9;
  flex-shrink: 0;
}

.conversation-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

:deep(.ant-avatar) {
  width: 40px !important;
  height: 40px !important;
  line-height: 40px !important;
  flex-shrink: 0;
}

:deep(.ant-list-item) {
  padding: 12px 16px;
}

:deep(.ant-list-item-meta) {
  align-items: center;
}

:deep(.ant-list-item-meta-content) {
  width: 0; /* 确保文本内容可以正确截断 */
}

:deep(.ant-tabs-nav) {
  padding: 0 16px;
}

</style>
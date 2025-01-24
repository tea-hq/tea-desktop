<template>
  <div class="conversation-window">
    <div class="conversation-header">
      <div class="conversation-title">
        <span class="title">会话对象名称</span>
        <span class="subtitle">在线</span>
      </div>
      <div class="conversation-actions">
        <a-space>
          <a-button type="text"><phone-outlined /></a-button>
          <a-button type="text"><video-camera-outlined /></a-button>
          <a-button type="text"><more-outlined /></a-button>
        </a-space>
      </div>
    </div>
    
    <div class="conversation-messages">
      <!-- 消息列表区域 -->
    </div>
    
    <div class="conversation-input">
      <div class="toolbar">
        <a-space>
          <a-button type="text"><smile-outlined /></a-button>
          <a-button type="text"><picture-outlined /></a-button>
          <a-button type="text"><folder-outlined /></a-button>
        </a-space>
      </div>
      <a-textarea
        v-model:value="messageText"
        :rows="3"
        placeholder="请输入消息..."
        :bordered="false"
      />
      <div class="send-area">
        <a-button type="primary">发送</a-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import {
  PhoneOutlined,
  VideoCameraOutlined,
  MoreOutlined,
  SmileOutlined,
  PictureOutlined,
  FolderOutlined
} from '@ant-design/icons-vue'

const messageText = ref('')
</script>

<style scoped>
.conversation-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.conversation-header {
  padding: 16px;
  border-bottom: 1px solid #d9d9d9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conversation-title {
  .title {
    font-size: 16px;
    font-weight: 500;
    margin-right: 8px;
  }
  .subtitle {
    font-size: 12px;
    color: #52c41a;
  }
}

.conversation-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.conversation-input {
  border-top: 1px solid #d9d9d9;
  background: #fff;
}

.toolbar {
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.send-area {
  padding: 8px 16px;
  text-align: right;
}

:deep(.ant-input) {
  resize: none;
}
</style>
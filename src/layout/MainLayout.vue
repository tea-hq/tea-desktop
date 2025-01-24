<template>
  <a-layout class="main-layout">
    <a-layout-sider width="64" class="primary-sidebar">
      <UserAvatar />
      <MainMenu />
    </a-layout-sider>
    <a-layout-sider 
      :width="siderWidth" 
      class="secondary-sidebar"
    >
      <ConversationList />
      <div 
        class="resize-handle"
        @mousedown="handleMouseDown"
      ></div>
    </a-layout-sider>
    <a-layout-content>
      <ConversationWindow />
    </a-layout-content>
  </a-layout>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import UserAvatar from '../components/sidebar/UserAvatar.vue'
import MainMenu from '../components/sidebar/MainMenu.vue'
import ConversationList from '../components/conversation/ConversationList.vue'
import ConversationWindow from '../components/conversation/ConversationWindow.vue'

const siderWidth = ref(320)

const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (e: MouseEvent) => {
  const newWidth = e.clientX - 64 // 减去左侧边栏宽度
  if (newWidth >= 280 && newWidth <= 400) {
    siderWidth.value = newWidth
  }
}

const handleMouseUp = () => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
}

.primary-sidebar {
  background: #2e3238;
  height: 100vh;
}

.secondary-sidebar {
  background: #f5f5f5;
  border-right: 1px solid #d9d9d9;
  position: relative;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
}
</style>
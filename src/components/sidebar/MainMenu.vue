<template>
  <div class="main-menu">
    <a-menu mode="inline" theme="dark">
      <a-menu-item key="message">
        <message-outlined />
        <span>消息</span>
      </a-menu-item>
      <a-menu-item key="contacts">
        <team-outlined />
        <span>通讯录</span>
      </a-menu-item>
      <a-menu-item key="cloud">
        <cloud-outlined />
        <span>云空间</span>
      </a-menu-item>
    </a-menu>
  </div>
</template>

<script lang="ts" setup>
import { MessageOutlined, TeamOutlined, CloudOutlined } from '@ant-design/icons-vue'
</script>

<style scoped>
.main-menu {
  margin-top: 20px;
}
</style>
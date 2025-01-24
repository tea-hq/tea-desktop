<template>
  <div class="user-avatar">
    <a-avatar :size="42" class="avatar">
      <template v-if="avatarUrl" #icon>
        <img :src="avatarUrl" alt="用户头像" />
      </template>
      <template v-else #icon>
        <UserOutlined />
      </template>
    </a-avatar>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { UserOutlined } from '@ant-design/icons-vue'
import { v2 } from 'node-nim'

const avatarUrl = ref('')

onMounted(async () => {
  try {
    const currentAccount = v2.loginService?.getLoginUser()
    if (currentAccount) {
      const users = await v2.userService?.getUserList([currentAccount])
      if (users && users.length > 0) {
        avatarUrl.value = users[0].avatar || ''
      }
    }
  } catch (error) {
    console.error('获取用户头像失败:', error)
  }
})
</script>

<style scoped>
.user-avatar {
  padding: 12px;
  text-align: center;
  border-bottom: 1px solid #24272C;
}

.avatar {
  background: #1890ff;
  cursor: pointer;
}

.avatar:hover {
  opacity: 0.8;
}
</style>
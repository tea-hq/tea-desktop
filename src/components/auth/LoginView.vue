<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <img src="/logo.png" alt="Logo" class="logo" />
        <h2>网易云信</h2>
      </div>
      <a-form
        :model="formState"
        name="login"
        @finish="handleSubmit"
        class="login-form"
      >
        <a-form-item
          name="username"
          :rules="[{ required: true, message: '请输入账号' }]"
        >
          <a-input v-model:value="formState.username" placeholder="账号">
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <a-input-password v-model:value="formState.password" placeholder="密码">
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="formState.remember">记住密码</a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            class="login-button"
            :loading="loading"
          >
            登录
          </a-button>
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { v2 } from 'node-nim'
import { MD5 } from 'crypto-js'

const router = useRouter()
const loading = ref(false)

const formState = reactive({
  username: 'jiajia01',
  password: 'dengjia.123',
  remember: false
})

const handleSubmit = async () => {
  loading.value = true
  try {
    // 对密码进行 md5 加密
    const encryptedPassword = MD5(formState.password).toString()
    await v2.loginService?.login(formState.username, encryptedPassword, {})
    
    // 设置登录状态
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('userInfo', JSON.stringify({
      username: formState.username
    }))
    
    message.success('登录成功')
    await router.replace('/main')
  } catch (error) {
    console.error('登录失败:', error)
    message.error('登录失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f2f5;
}

.login-box {
  width: 360px;
  padding: 40px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  width: 64px;
  margin-bottom: 16px;
}

.login-button {
  width: 100%;
}
</style>
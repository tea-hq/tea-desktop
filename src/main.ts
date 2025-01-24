import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import { yunxin } from './utils/yunxin'

const initApp = async () => {
  try {
    await yunxin.initialize()
    const app = createApp(App)
    app.use(router)
    app.use(Antd)
    app.mount('#app')
  } catch (error) {
    console.error('Application initialization failed:', error)
  }
}

initApp()

// 添加窗口关闭前的清理
window.addEventListener('beforeunload', async () => {
  // event.preventDefault()
  await yunxin.cleanup()
})

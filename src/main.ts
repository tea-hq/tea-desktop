import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import E2eFixtureApp from './app/E2eFixtureApp.vue'
import ManagementFixtureApp from './app/ManagementFixtureApp.vue'
import { i18n } from './i18n'
import './assets/main.css'

const isE2e = import.meta.env.VITE_E2E === 'true'
const isManagementFixture =
  new URLSearchParams(window.location.search).get('fixture') === 'management'
const app = createApp(isE2e ? (isManagementFixture ? ManagementFixtureApp : E2eFixtureApp) : App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.mount('#app')

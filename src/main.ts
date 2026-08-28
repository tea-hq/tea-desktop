import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import E2eFixtureApp from './app/E2eFixtureApp.vue'
import { i18n } from './i18n'
import { installTeaUi } from './shared/ui/theme/installTeaUi'
import './assets/main.css'

const app = createApp(import.meta.env.VITE_E2E === 'true' ? E2eFixtureApp : App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
installTeaUi(app)
app.mount('#app')

import { createRouter, createWebHashHistory } from 'vue-router'
import LoginView from '../components/auth/LoginView.vue'
import MainLayout from '../layout/MainLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/login'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/main',
      name: 'main',
      component: MainLayout,
      meta: { requiresAuth: true }
    }
  ]
})

// router.beforeEach((to, from, next) => {
//   const isAuthenticated = localStorage.getItem('isAuthenticated')
//   console.log('----------------------------------------- isAuthenticated', isAuthenticated)
//   if (to.meta.requiresAuth && !isAuthenticated) {
//     console.log('------------------------- 01')
//     next({ name: 'login' })
//   } else if (to.name === 'login' && isAuthenticated) {
//     console.log('------------------------- 02')
//     next({ name: 'main' })
//   } else {
//     console.log('------------------------- 03')
//     next()
//   }
// })

export default router
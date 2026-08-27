<script setup lang="ts">
import EnterpriseLogin from '@/features/auth/components/EnterpriseLogin.vue'
import WorkspaceShell from './WorkspaceShell.vue'
import { provideTeaDesktopApp } from '@/app/teaDesktopContext'
import { useTeaDesktopApp } from '@/app/useTeaDesktopApp'

const app = useTeaDesktopApp()
provideTeaDesktopApp(app)
const { centerAuth } = app
</script>

<template>
  <EnterpriseLogin
    v-if="!centerAuth.canEnterWorkspace"
    :domain="centerAuth.domain"
    :phase="centerAuth.state.phase"
    :pending="centerAuth.pending"
    :error-code="centerAuth.state.errorCode"
    @update:domain="centerAuth.domain = $event"
    @submit="centerAuth.login()"
    @cancel="centerAuth.cancelLogin()"
  />
  <WorkspaceShell v-else />
</template>

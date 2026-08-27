<script setup lang="ts">
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'

export interface TeaTabOption {
  value: string
  label: string
  disabled?: boolean
}

defineProps<{ modelValue: string; tabs: TeaTabOption[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <Tabs :value="modelValue" @update:value="emit('update:modelValue', String($event))">
    <TabList :pt="{ tabList: { 'aria-label': label } }">
      <Tab v-for="tab in tabs" :key="tab.value" :value="tab.value" :disabled="tab.disabled">{{ tab.label }}</Tab>
    </TabList>
    <TabPanels>
      <TabPanel v-for="tab in tabs" :key="tab.value" :value="tab.value"><slot :name="tab.value" /></TabPanel>
    </TabPanels>
  </Tabs>
</template>

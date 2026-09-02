<template>
  <div
    class="window-chrome flex h-screen min-h-0 min-w-0 flex-col overflow-hidden bg-canvas text-fg"
  >
    <div class="window-chrome__drag-region bg-canvas" aria-hidden="true" />
    <slot />
  </div>
</template>

<style scoped>
.window-chrome__drag-region {
  flex: 0 0 36px;
  height: 36px;
  -webkit-app-region: drag;
  user-select: none;
}
</style>

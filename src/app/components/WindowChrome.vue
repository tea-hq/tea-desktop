<template>
  <div
    class="window-chrome flex h-screen min-h-0 min-w-0 flex-col overflow-hidden bg-canvas text-fg"
  >
    <div class="window-chrome__drag-region border-b border-line-soft bg-canvas">
      <div class="window-chrome__toolbar min-w-0">
        <slot name="toolbar" />
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.window-chrome__drag-region {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 48px;
  height: 48px;
  -webkit-app-region: drag;
  user-select: none;
}

.window-chrome__toolbar {
  display: flex;
  width: min(40rem, calc(100% - 12rem));
  align-items: center;
  user-select: auto;
  -webkit-app-region: no-drag;
}

@media (max-width: 640px) {
  .window-chrome__toolbar {
    width: min(24rem, calc(100% - 3rem));
  }
}
</style>

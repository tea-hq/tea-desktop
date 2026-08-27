<script setup lang="ts">
import DOMPurify, { type Config } from 'dompurify'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

import { renderMarkdownToHtml } from '../markdown/renderer'

const props = withDefaults(
  defineProps<{
    source: string
    streaming?: boolean
    compact?: boolean
    tone?: 'default' | 'inverse'
  }>(),
  {
    streaming: false,
    compact: false,
    tone: 'default',
  }
)

const sanitizeConfig: Config = {
  ADD_ATTR: ['decoding', 'loading', 'referrerpolicy', 'target'],
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ['style'],
  FORBID_TAGS: ['button', 'embed', 'form', 'iframe', 'input', 'object', 'option', 'select', 'style', 'textarea'],
  RETURN_TRUSTED_TYPE: false,
  USE_PROFILES: { html: true },
}

const renderedHtml = shallowRef('')
let frameId: number | null = null

function render(): void {
  if (frameId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(frameId)
    frameId = null
  }
  renderedHtml.value = DOMPurify.sanitize(renderMarkdownToHtml(props.source), sanitizeConfig)
}

function scheduleRender(): void {
  if (!props.streaming || typeof window === 'undefined') {
    render()
    return
  }
  if (frameId !== null) return
  frameId = window.requestAnimationFrame(() => {
    frameId = null
    renderedHtml.value = DOMPurify.sanitize(renderMarkdownToHtml(props.source), sanitizeConfig)
  })
}

watch([() => props.source, () => props.streaming], scheduleRender, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => {
  if (frameId !== null) window.cancelAnimationFrame(frameId)
})
</script>

<template>
  <div
    class="markdown-content"
    :class="{
      'markdown-content--compact': compact,
      'markdown-content--inverse': tone === 'inverse',
      'markdown-content--streaming': streaming,
    }"
    data-markdown-content
    v-html="renderedHtml"
  />
</template>

<style scoped>
.markdown-content {
  min-width: 0;
  color: #1f2937;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.markdown-content :deep(> :first-child) {
  margin-top: 0;
}

.markdown-content :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(p) {
  margin: 0 0 10px;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  color: #111827;
  font-weight: 600;
}

.markdown-content :deep(h1) {
  margin: 20px 0 8px;
  font-size: 18px;
  line-height: 1.4;
}

.markdown-content :deep(h2) {
  margin: 18px 0 7px;
  font-size: 16px;
  line-height: 1.45;
}

.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 16px 0 6px;
  font-size: 14px;
  line-height: 1.5;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0 12px;
  padding-left: 22px;
}

.markdown-content :deep(ul) {
  list-style: disc;
}

.markdown-content :deep(ol) {
  list-style: decimal;
}

.markdown-content :deep(li + li) {
  margin-top: 4px;
}

.markdown-content :deep(li > ul),
.markdown-content :deep(li > ol) {
  margin: 4px 0;
}

.markdown-content :deep(a) {
  color: #111827;
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: #9ca3af;
  text-underline-offset: 3px;
}

.markdown-content :deep(a:hover) {
  text-decoration-color: #111827;
}

.markdown-content :deep(blockquote) {
  margin: 10px 0;
  padding-left: 12px;
  border-left: 2px solid #d1d5db;
  color: #6b7280;
}

.markdown-content :deep(code) {
  padding: 1px 4px;
  background: #e5e7eb;
  color: #374151;
  font-family: var(--font-mono);
  font-size: 11px;
}

.markdown-content :deep(pre) {
  max-width: 100%;
  margin: 10px 0 12px;
  padding: 12px 14px;
  overflow: auto;
  background: #ffffff;
  color: #374151;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
  tab-size: 2;
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
}

.markdown-content :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  margin: 10px 0 12px;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 12px;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 7px 12px 7px 0;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: top;
}

.markdown-content :deep(th) {
  color: #374151;
  font-weight: 600;
}

.markdown-content :deep(hr) {
  margin: 16px 0;
  border: 0;
  border-top: 1px solid #e5e7eb;
}

.markdown-content :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
}

.markdown-content--compact :deep(p) {
  margin-bottom: 6px;
}

.markdown-content--compact :deep(h1),
.markdown-content--compact :deep(h2),
.markdown-content--compact :deep(h3),
.markdown-content--compact :deep(h4) {
  margin: 12px 0 5px;
}

.markdown-content--compact :deep(h1) {
  font-size: 16px;
}

.markdown-content--compact :deep(h2) {
  font-size: 15px;
}

.markdown-content--compact :deep(ul),
.markdown-content--compact :deep(ol),
.markdown-content--compact :deep(pre),
.markdown-content--compact :deep(table) {
  margin-top: 6px;
  margin-bottom: 8px;
}

.markdown-content--inverse {
  color: #f9fafb;
}

.markdown-content--inverse :deep(h1),
.markdown-content--inverse :deep(h2),
.markdown-content--inverse :deep(h3),
.markdown-content--inverse :deep(h4) {
  color: #ffffff;
}

.markdown-content--inverse :deep(a) {
  color: #ffffff;
  text-decoration-color: #9ca3af;
}

.markdown-content--inverse :deep(a:hover) {
  text-decoration-color: #ffffff;
}

.markdown-content--inverse :deep(blockquote) {
  border-left-color: #6b7280;
  color: #d1d5db;
}

.markdown-content--inverse :deep(code) {
  background: #374151;
  color: #f9fafb;
}

.markdown-content--inverse :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
}

.markdown-content--inverse :deep(pre code) {
  background: transparent;
}

.markdown-content--inverse :deep(th),
.markdown-content--inverse :deep(td) {
  border-bottom-color: #4b5563;
}

.markdown-content--inverse :deep(th) {
  color: #f3f4f6;
}

.markdown-content--inverse :deep(hr) {
  border-top-color: #4b5563;
}

.markdown-content--streaming::after {
  display: inline-block;
  width: 4px;
  height: 14px;
  margin-left: 2px;
  background: #9ca3af;
  border-radius: 1px;
  vertical-align: -2px;
  animation: markdown-cursor 1s ease-in-out infinite;
  content: '';
}

.markdown-content--streaming :deep(> p:last-child) {
  display: inline;
}

@keyframes markdown-cursor {
  50% {
    opacity: 0.25;
  }
}
</style>

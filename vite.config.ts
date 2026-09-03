import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, type Plugin } from 'vitest/config'
import electron from 'vite-plugin-electron/simple'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { version as pkgVersion } from './package.json'

process.env.VITE_APP_VERSION = pkgVersion
if (process.env.NODE_ENV === 'production') {
  process.env.VITE_APP_BUILD_EPOCH = new Date().getTime().toString()
}
const isE2eFixtureServer = process.env.VITE_E2E === 'true'

const webkitInspectorSourceMapCors: Plugin = {
  name: 'webkit-inspector-source-map-cors',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?', 1)[0]?.endsWith('.map')) {
        response.setHeader('Access-Control-Allow-Origin', '*')
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [
    webkitInspectorSourceMapCors,
    tailwind(),
    ...(process.env.VITEST ? [] : [nodePolyfills()]),
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({ dts: 'components.d.ts' }),
    ...(isE2eFixtureServer
      ? []
      : [
          electron({
            main: {
              entry: {
                main: 'electron/main.ts',
                'mcp-process': 'electron/conversation/acp/mcpProcess.ts',
              },
              vite: {
                build: {
                  rollupOptions: {
                    // ws is CommonJS and must be loaded by Node from the main process.
                    external: [
                      'ws',
                      '@agentclientprotocol/sdk',
                      '@agentclientprotocol/sdk/experimental/v2',
                      '@agentclientprotocol/claude-agent-acp',
                      '@agentclientprotocol/codex-acp',
                      '@modelcontextprotocol/sdk',
                    ],
                  },
                },
              },
            },
            preload: { input: fileURLToPath(new URL('./electron/preload.ts', import.meta.url)) },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorMaxWorkers: true,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TEA_'],
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: ['**/.codegraph/**', '**/src-tauri/**'],
    },
  },
  build: {
    outDir: './dist',
    target: 'chrome120',
    minify: 'esbuild',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
  },
  test: {
    include: [
      'scripts/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
  },
})

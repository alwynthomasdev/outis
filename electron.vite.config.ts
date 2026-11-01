import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
      rolldownOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Background worker (utilityProcess) for parsing, anonymising and the NER model.
          worker: resolve('src/main/worker.ts')
        }
      }
    }
  },
  preload: {
    build: { sourcemap: true }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@core': resolve('src/core'),
        '@shared': resolve('src/shared')
      }
    },
    build: { sourcemap: true },
    plugins: [vue()]
  }
})

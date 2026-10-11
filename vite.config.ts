import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 渲染进程双入口；chrome108 显式钉死（ADR-0001：Electron 22 / Chromium 108 上限）
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    target: 'chrome108',
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: resolve(__dirname, 'src/control/index.html'),
        projection: resolve(__dirname, 'src/projection/index.html'),
      },
    },
  },
})

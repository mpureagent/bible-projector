import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// W1：Web 宿主构建——base '/'、产物 dist/web，目录结构与 Electron 完全一致。
// web-boot 仅注入 Web 构建，Electron 的 index.html 与 vite.config.ts 均不受影响。

function webBootPlugin(): Plugin {
  return {
    name: 'w1-web-boot',
    transformIndexHtml(html, ctx) {
      const isProjection = /[\\/]projection[\\/]/.test(ctx.filename)
      // 构建后 boot 是独立入口（固定文件名）；dev 下直接引用源文件
      const src = ctx.server
        ? isProjection
          ? '/projection/web-boot.ts'
          : '/control/web-boot.ts'
        : isProjection
          ? '/boot/projection-boot.js'
          : '/boot/control-boot.js'
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module', src },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  root: 'src',
  base: '/',
  publicDir: resolve(__dirname, 'assets'),
  plugins: [webBootPlugin()],
  build: {
    target: 'chrome108',
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: resolve(__dirname, 'src/control/index.html'),
        projection: resolve(__dirname, 'src/projection/index.html'),
        'control-boot': resolve(__dirname, 'src/control/web-boot.ts'),
        'projection-boot': resolve(__dirname, 'src/projection/web-boot.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name.endsWith('-boot') ? 'boot/[name].js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
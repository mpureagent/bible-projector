import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

describe('工程底座（T2 任务 1）', () => {
  it('渲染端构建目标显式钉死 chrome108（ADR-0001，Chromium 108 上限）', () => {
    expect(viteConfig.build?.target).toBe('chrome108')
  })

  it('Vite 多入口：control / projection 两个渲染窗 html', () => {
    const input = viteConfig.build?.rollupOptions?.input as Record<string, string>
    expect(Object.keys(input).sort()).toEqual(['control', 'projection'])
  })
})

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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

describe('T7-flow：分页引擎退役且无孤儿引用（验收 1）', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    )

  it('src/projection/paginate.ts 已删除', () => {
    expect(existsSync('src/projection/paginate.ts')).toBe(false)
  })

  it('src 内无 computePages / paginate 引用（无孤儿）', () => {
    for (const file of [...walk('src'), 'vite.config.ts', 'vitest.config.ts']) {
      if (!/\.(ts|mts|mjs|html)$/.test(file)) continue
      const source = readFileSync(file, 'utf-8')
      expect(source, `${file} 不应再引用分页引擎`).not.toMatch(/computePages|pageForVerse|projection\/paginate|'\.\/paginate'/)
    }
  })
})

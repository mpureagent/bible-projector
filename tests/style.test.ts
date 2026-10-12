import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'
import { FONT_STACKS, TEXTURES, validateBackgroundImage } from '../src/shared/style'
import { PROJECTION_THEMES, PROJECTION_THEME_PRESETS } from '../src/shared/themes'
import type { ProjectionStyle } from '../src/shared/types'

// T4-style：§2.3 样式全项、§7.2 三套预设主题 token、背景图路径校验、内置纹理、store 钳制/清洗/持久化

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fakePersistence() {
  let saved: { style?: ProjectionStyle; display?: number | null } = {}
  const persistence: Persistence = {
    loadConfig: () => ({}),
    saveConfig: (c) => {
      saved = JSON.parse(JSON.stringify(c))
    },
    loadHistory: () => [],
    saveHistory: () => {},
  }
  return { persistence, saved: () => saved, reload: () => ({ ...persistence, loadConfig: () => saved }) }
}

describe('T4-style 字体栈（§7.3 扩展）', () => {
  it('四选：内嵌宋体含 Bible Serif SC、系统宋体不含、楷体含 KaiTi、黑体无 serif 兜底', () => {
    expect(FONT_STACKS['embedded-serif']).toContain('"Bible Serif SC"')
    expect(FONT_STACKS['system-serif']).not.toContain('Bible Serif SC')
    expect(FONT_STACKS['system-serif']).toContain('"Noto Serif CJK SC"')
    expect(FONT_STACKS['kai']).toContain('"KaiTi"')
    expect(FONT_STACKS['sans']).toContain('"Noto Sans CJK SC"')
    expect(FONT_STACKS['sans']).not.toContain('serif"')
  })
})

describe('T4-style 背景图路径校验（拒绝网络 URL）', () => {
  it('网络/协议 URL 全拒绝：http/https/ftp/file/相对路径', () => {
    for (const bad of [
      'https://example.com/bg.png',
      'http://example.com/bg.png',
      'ftp://example.com/bg.png',
      'file:///data/bg.png',
      '//example.com/bg.png',
      'relative/bg.png',
      'bg.png',
    ]) {
      expect(validateBackgroundImage(bad), `应拒绝 ${bad}`).not.toBeNull()
    }
  })

  it('内置纹理 id 与本地绝对路径放行', () => {
    expect(validateBackgroundImage(null)).toBeNull()
    expect(validateBackgroundImage('')).toBeNull()
    expect(validateBackgroundImage('builtin:ink-mist')).toBeNull()
    expect(validateBackgroundImage('builtin:rice-paper')).toBeNull()
    expect(validateBackgroundImage('builtin:deep-water')).toBeNull()
    expect(validateBackgroundImage('/data/pics/my-bg.png')).toBeNull()
    expect(validateBackgroundImage('/home/o/bg.jpg')).toBeNull()
  })

  it('未知内置 id 拒绝（防拼错静默失效）', () => {
    expect(validateBackgroundImage('builtin:nonexistent')).not.toBeNull()
  })
})

describe('T4-style 内置纹理（程序化 SVG，≤200KB/张）', () => {
  it('3 张齐备且单张 ≤200KB', () => {
    expect(TEXTURES).toHaveLength(3)
    for (const tex of TEXTURES) {
      const path = resolve(here, 'assets/textures', tex.file)
      expect(existsSync(path), `${tex.file} 应随包`).toBe(true)
      const bytes = statSync(path).size
      console.log(`[T4-style] texture ${tex.file} bytes=${bytes}`)
      expect(bytes).toBeLessThanOrEqual(200 * 1024)
      expect(readFileSync(path, 'utf-8')).toContain('<svg')
    }
  })
})

describe('T4-style 预设主题（§7.2 墨金/米白/深蓝）', () => {
  it('三套 token 齐备：background/color/verseNumber/currentColor', () => {
    for (const name of ['ink', 'ivory', 'ocean'] as const) {
      const theme = PROJECTION_THEMES[name]!
      expect(theme.background).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.verseNumber).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.currentColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('一键套用补丁：置 theme 并清空全部自定义覆盖（回归主题 token）', () => {
    for (const name of ['ink', 'ivory', 'ocean'] as const) {
      const patch = PROJECTION_THEME_PRESETS[name]!
      expect(patch.theme).toBe(name)
      expect(patch.color).toBeNull()
      expect(patch.verseNumberColor).toBeNull()
      expect(patch.currentColor).toBeNull()
      expect(patch.background).toBeNull()
      expect(patch.backgroundImage).toBeNull()
    }
  })
})

describe('T4-style store 钳制/清洗/持久化', () => {
  it('非法 backgroundImage（网络 URL）被清洗为 null，其余字段照常合并', () => {
    const { persistence } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'style', patch: { backgroundImage: 'https://evil.example/bg.png', lineHeight: 2 } })
    expect(store.getState().style.backgroundImage).toBeNull()
    expect(store.getState().style.lineHeight).toBe(2)
  })

  it('边距钳制 ≥8%（§11 安全区）、行距/字距限幅', () => {
    const { persistence } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'style', patch: { margin: 4, lineHeight: 0.2, letterSpacing: 5 } })
    const style = store.getState().style
    expect(style.margin).toBe(8)
    expect(style.lineHeight).toBe(1)
    expect(style.letterSpacing).toBe(0.5)
  })

  it('全项样式持久化重载：save → load 回来逐字段全等', () => {
    const { persistence, reload } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({
      type: 'style',
      patch: {
        theme: 'ivory',
        fontSize: 120,
        mode: 'single',
        hideVerseNumbers: true,
        hideTitle: true,
        fontFamily: 'kai',
        color: '#AA0000',
        verseNumberColor: '#00AA00',
        currentColor: '#0000AA',
        background: '#123456',
        backgroundImage: '/data/pics/bg.png',
        lineHeight: 2.2,
        letterSpacing: 0.1,
        align: 'left',
        margin: 12,
      },
    })
    const store2 = new AppStateStore(reload())
    expect(store2.getState().style).toEqual(store.getState().style)
  })
})

import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'
import { FONT_STACKS, TEXTURES, validateBackgroundImage } from '../src/shared/style'
import { PROJECTION_THEMES, PROJECTION_THEME_PRESETS, THEME_LABELS } from '../src/shared/themes'
import type { ProjectionStyle, ThemeName } from '../src/shared/types'

// T4-style/T7-style：§2.3 样式全项、R5 八套预设主题 token 全等、背景三选一互斥、
// 路径校验、内置纹理、store 钳制/清洗/持久化/旧配置迁移

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

const THEME_NAMES = Object.keys(PROJECTION_THEMES) as ThemeName[]

describe('T7-style 字体栈（R5：宋体子集/黑体子集/楷体/系统默认）', () => {
  it('宋体子集含 Bible Serif SC、黑体子集含 Bible Sans SC、楷体走 KaiTi、系统默认走 system-ui', () => {
    expect(FONT_STACKS['embedded-serif']).toContain('"Bible Serif SC"')
    expect(FONT_STACKS['sans']).toContain('"Bible Sans SC"')
    expect(FONT_STACKS['sans']).not.toContain('Bible Serif SC')
    expect(FONT_STACKS['kai']).toContain('"KaiTi"')
    expect(FONT_STACKS['kai']).toContain('"楷体"')
    expect(FONT_STACKS['kai']).not.toContain('Bible ')
    expect(FONT_STACKS['system-serif']).toContain('system-ui')
    expect(FONT_STACKS['system-serif']).not.toContain('Bible ')
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

describe('T7-style 八套预设主题（R5 表色值严格）', () => {
  it('恰 8 套且每套 token 齐备（5 列均 #hex）', () => {
    expect(THEME_NAMES).toHaveLength(8)
    for (const name of THEME_NAMES) {
      const theme = PROJECTION_THEMES[name]!
      for (const field of ['background', 'color', 'verseNumber', 'currentColor', 'currentBackground'] as const) {
        expect(theme[field], `${name}.${field}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
      expect(THEME_LABELS[name]).toBeTruthy()
    }
  })

  it('R5 表三值逐套全等（bg/fg/节号色）', () => {
    const table: Record<ThemeName, [string, string, string]> = {
      ink: ['#101418', '#E8C87A', '#8A7440'],
      ivory: ['#F5F1E8', '#2A2622', '#8C8375'],
      ocean: ['#0E1B2A', '#F0E6D2', '#7E8CA0'],
      parchment: ['#EDE3D0', '#3A2F22', '#9A8468'],
      forest: ['#0F1F18', '#D8E8D4', '#6F8A78'],
      charcoal: ['#1C1C1E', '#E5E5E5', '#8E8E93'],
      contrast: ['#FFFFFF', '#111111', '#666666'],
      wine: ['#2B0F14', '#F2D8B8', '#A87B5C'],
    }
    for (const name of THEME_NAMES) {
      const [bg, fg, vn] = table[name]
      expect(PROJECTION_THEMES[name]!.background).toBe(bg)
      expect(PROJECTION_THEMES[name]!.color).toBe(fg)
      expect(PROJECTION_THEMES[name]!.verseNumber).toBe(vn)
    }
  })

  it('出厂默认墨金（DEFAULT_STYLE.theme=ink）', () => {
    const { persistence } = fakePersistence()
    const store = new AppStateStore(persistence)
    expect(store.getState().style.theme).toBe('ink')
  })

  it('一键套用补丁：置 theme + 清空覆盖 + 背景回归主题（R8c）', () => {
    for (const name of THEME_NAMES) {
      const patch = PROJECTION_THEME_PRESETS[name]!
      expect(patch.theme).toBe(name)
      expect(patch.color).toBeNull()
      expect(patch.verseNumberColor).toBeNull()
      expect(patch.currentColor).toBeNull()
      expect(patch.background).toBeNull()
      expect(patch.backgroundImage).toBeNull()
      expect(patch.backgroundMode).toBe('theme')
    }
  })

  it('8 套两两可辨：background/color 组合无重复', () => {
    const seen = new Set(THEME_NAMES.map((n) => `${PROJECTION_THEMES[n]!.background}|${PROJECTION_THEMES[n]!.color}`))
    expect(seen.size).toBe(8)
  })
})

describe('T7-style 背景三选一互斥（R8c）', () => {
  const build = () => new AppStateStore(fakePersistence().persistence)

  it('选纯色 → 清空纹理（backgroundMode=color、backgroundImage=null）', () => {
    const store = build()
    store.dispatch({ type: 'style', patch: { backgroundMode: 'texture', backgroundImage: 'builtin:ink-mist' } })
    expect(store.getState().style.backgroundMode).toBe('texture')
    store.dispatch({ type: 'style', patch: { backgroundMode: 'color', background: '#123456' } })
    expect(store.getState().style.backgroundMode).toBe('color')
    expect(store.getState().style.background).toBe('#123456')
    expect(store.getState().style.backgroundImage).toBeNull()
  })

  it('选纹理 → 清空纯色（background=null）', () => {
    const store = build()
    store.dispatch({ type: 'style', patch: { backgroundMode: 'color', background: '#123456' } })
    store.dispatch({ type: 'style', patch: { backgroundMode: 'texture', backgroundImage: 'builtin:deep-water' } })
    expect(store.getState().style.background).toBeNull()
    expect(store.getState().style.backgroundImage).toBe('builtin:deep-water')
  })

  it('非法值回落主题：纹理模式给本地路径 → theme；纯色模式给非法色 → theme', () => {
    const a = build()
    a.dispatch({ type: 'style', patch: { backgroundMode: 'texture', backgroundImage: '/data/x.png' } })
    expect(a.getState().style.backgroundMode).toBe('theme')
    const b = build()
    b.dispatch({ type: 'style', patch: { backgroundMode: 'color', background: 'not-a-color' } })
    expect(b.getState().style.backgroundMode).toBe('theme')
    expect(b.getState().style.background).toBeNull()
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
        theme: 'parchment',
        fontSize: 120,
        hideVerseNumbers: true,
        hideTitle: true,
        fontFamily: 'sans',
        color: '#AA0000',
        verseNumberColor: '#00AA00',
        currentColor: '#0000AA',
        backgroundMode: 'image',
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

  it('旧配置迁移（R8c）：仅 backgroundImage 的 v0.9.0 config → backgroundMode 推导为 texture', () => {
    const { persistence } = fakePersistence()
    persistence.loadConfig = () => ({ style: { theme: 'ivory', backgroundImage: 'builtin:rice-paper' } })
    const store = new AppStateStore(persistence)
    expect(store.getState().style.backgroundMode).toBe('texture')
    expect(store.getState().style.backgroundImage).toBe('builtin:rice-paper')
    expect(store.getState().style.theme).toBe('ivory')
  })

  it('旧配置迁移：纯色 background → backgroundMode=color；无背景字段 → theme', () => {
    const { persistence } = fakePersistence()
    persistence.loadConfig = () => ({ style: { background: '#123456' } })
    expect(new AppStateStore(persistence).getState().style.backgroundMode).toBe('color')
    const p2 = fakePersistence()
    p2.persistence.loadConfig = () => ({ style: {} })
    expect(new AppStateStore(p2.persistence).getState().style.backgroundMode).toBe('theme')
  })
})
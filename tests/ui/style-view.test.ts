// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { StyleView } from '../../src/control/style-view'
import { FONT_CHOICES, TEXTURES } from '../../src/shared/style'
import { PROJECTION_THEME_PRESETS, PROJECTION_THEMES } from '../../src/shared/themes'
import type { ProjectionStyle, ThemeName } from '../../src/shared/types'

// T7-style：样式抽屉（R5/R8c）——8 主题一键套用、全项控件 dispatch、背景三选一、
// ✕/遮罩关闭、单节模式控件已废除

const baseStyle: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  backgroundMode: 'theme',
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

function mount(dispatchStyle = vi.fn()): { view: StyleView; root: HTMLElement; dispatchStyle: typeof dispatchStyle } {
  const root = document.createElement('aside')
  document.body.appendChild(root)
  const view = new StyleView(root, { onPatch: dispatchStyle })
  return { view, root, dispatchStyle }
}

const THEME_NAMES = Object.keys(PROJECTION_THEMES) as ThemeName[]

describe('T7-style 预设主题缩略图（R5：8 套）', () => {
  it('恰 8 个缩略图，色块底色=主题背景；点击一键套用补丁', () => {
    const { root, dispatchStyle } = mount()
    const btns = [...root.querySelectorAll<HTMLElement>('[data-theme]')]
    expect(btns).toHaveLength(8)
    for (const name of THEME_NAMES) {
      const btn = root.querySelector<HTMLElement>(`[data-theme="${name}"]`)!
      expect(btn, `应有 ${name} 主题按钮`).toBeTruthy()
      expect(btn.style.backgroundColor).toBe(PROJECTION_THEMES[name]!.background)
      btn.click()
      expect(dispatchStyle).toHaveBeenCalledWith(PROJECTION_THEME_PRESETS[name])
    }
    expect(dispatchStyle).toHaveBeenCalledTimes(8)
  })
})

describe('T7-style 排版控件（R5）', () => {
  it('字体四选标签 宋体（子集）/黑体（子集）/楷体/系统默认；dispatch', () => {
    const { root, dispatchStyle } = mount()
    const labels = [...root.querySelectorAll('[data-field="fontFamily"] option')].map((o) => o.textContent)
    for (const label of ['宋体（子集）', '黑体（子集）', '楷体', '系统默认']) expect(labels).toContain(label)
    expect(FONT_CHOICES).toHaveLength(4)
    const font = root.querySelector<HTMLSelectElement>('[data-field="fontFamily"]')!
    font.value = 'sans'
    font.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ fontFamily: 'sans' })
  })

  it('行距/字距/对齐/边距滑块 dispatch；对齐仅左/中', () => {
    const { root, dispatchStyle } = mount()
    const lh = root.querySelector<HTMLInputElement>('[data-field="lineHeight"]')!
    lh.value = '2.1'
    lh.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ lineHeight: 2.1 })
    const margin = root.querySelector<HTMLInputElement>('[data-field="margin"]')!
    margin.value = '12'
    margin.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ margin: 12 })
    const alignOptions = [...root.querySelectorAll<HTMLOptionElement>('[data-field="align"] option')].map((o) => o.value)
    expect(alignOptions).toEqual(['left', 'center'])
  })

  it('字号滑块 + A± 步进 dispatch', () => {
    const { root, dispatchStyle } = mount()
    const size = root.querySelector<HTMLInputElement>('[data-field="fontSize"]')!
    size.value = '96'
    size.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ fontSize: 96 })
    root.querySelector<HTMLElement>('[data-step="12"]')!.click()
    expect(dispatchStyle).toHaveBeenCalledWith({ fontSize: 108 })
  })

  it('单节模式控件已废除（R2/R4）：无 [data-field="mode"]', () => {
    const { root } = mount()
    expect(root.querySelector('[data-field="mode"]')).toBeNull()
  })
})

describe('T7-style 颜色与重置（R5）', () => {
  it('颜色三项改值 dispatch；重置为当前主题 → 套用当前主题预设', () => {
    const { root, dispatchStyle, view } = mount()
    view.renderState({ ...baseStyle, theme: 'ocean' })
    const color = root.querySelector<HTMLInputElement>('[data-field="color"]')!
    color.value = '#AA0000'
    color.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ color: '#aa0000' })

    const reset = root.querySelector<HTMLButtonElement>('[data-reset="theme"]')!
    reset.click()
    expect(dispatchStyle).toHaveBeenCalledWith(PROJECTION_THEME_PRESETS.ocean)
  })
})

describe('T7-style 背景三选一（R8c）', () => {
  it('选纯色 → dispatch {backgroundMode:color}；子控件互斥显隐', () => {
    const { root, dispatchStyle } = mount()
    const mode = root.querySelector<HTMLSelectElement>('[data-field="backgroundMode"]')!
    mode.value = 'color'
    mode.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith(expect.objectContaining({ backgroundMode: 'color' }))
    expect(root.querySelector<HTMLInputElement>('[data-field="backgroundColor"]')!.hidden).toBe(false)
    expect(root.querySelector<HTMLSelectElement>('[data-field="texture"]')!.hidden).toBe(true)
  })

  it('选纹理 → dispatch builtin:id；纹理选项 3 个', () => {
    const { root, dispatchStyle } = mount()
    const mode = root.querySelector<HTMLSelectElement>('[data-field="backgroundMode"]')!
    mode.value = 'texture'
    mode.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({
      backgroundMode: 'texture',
      backgroundImage: `builtin:${TEXTURES[0]!.id}`,
    })
  })

  it('自定义图片：网络 URL 报错不 dispatch；合法绝对路径 dispatch {backgroundMode:image}', () => {
    const { root, dispatchStyle } = mount()
    const mode = root.querySelector<HTMLSelectElement>('[data-field="backgroundMode"]')!
    mode.value = 'image'
    mode.dispatchEvent(new Event('change'))
    const input = root.querySelector<HTMLInputElement>('[data-field="backgroundImageCustom"]')!
    input.value = 'https://evil.example/bg.png'
    input.dispatchEvent(new Event('change'))
    expect(root.querySelector('.style-error')?.textContent).toBeTruthy()
    expect(dispatchStyle).not.toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImage: 'https://evil.example/bg.png' }),
    )

    input.value = '/data/pics/bg.png'
    input.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ backgroundMode: 'image', backgroundImage: '/data/pics/bg.png' })
  })
})

describe('T7-style 抽屉开合（R5：✕ + 遮罩关闭）', () => {
  it('✕ 点击关闭；遮罩点击关闭', () => {
    const { root, view } = mount()
    view.setVisible(true)
    expect(root.hidden).toBe(false)
    root.querySelector<HTMLElement>('.style-close')!.click()
    expect(root.hidden).toBe(true)
    view.setVisible(true)
    root.querySelector<HTMLElement>('.style-mask')!.click()
    expect(root.hidden).toBe(true)
  })

  it('setVisible/toggle 属性互切', () => {
    const { view, root } = mount()
    expect(root.hidden).toBe(true)
    view.setVisible(true)
    expect(root.hidden).toBe(false)
    view.toggle()
    expect(root.hidden).toBe(true)
  })
})

describe('T7-style renderState 同步', () => {
  it('控件值与当前状态一致（含 backgroundMode/字体/字号/对齐/边距）', () => {
    const { view, root } = mount()
    view.renderState({
      ...baseStyle,
      theme: 'wine',
      fontFamily: 'sans',
      fontSize: 96,
      align: 'left',
      margin: 12,
      backgroundMode: 'texture',
      backgroundImage: 'builtin:deep-water',
    })
    expect(root.querySelector<HTMLSelectElement>('[data-field="fontFamily"]')?.value).toBe('sans')
    expect(root.querySelector<HTMLInputElement>('[data-field="fontSize"]')?.value).toBe('96')
    expect(root.querySelector<HTMLSelectElement>('[data-field="align"]')?.value).toBe('left')
    expect(root.querySelector<HTMLInputElement>('[data-field="margin"]')?.value).toBe('12')
    expect(root.querySelector<HTMLSelectElement>('[data-field="backgroundMode"]')?.value).toBe('texture')
    expect(root.querySelector<HTMLElement>('[data-theme="wine"]')?.classList.contains('active')).toBe(true)
  })

  it('隐藏节号 dispatch', () => {
    const { root, dispatchStyle } = mount()
    const hideNums = root.querySelector<HTMLInputElement>('[data-field="hideVerseNumbers"]')!
    hideNums.checked = true
    hideNums.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ hideVerseNumbers: true })
  })
})
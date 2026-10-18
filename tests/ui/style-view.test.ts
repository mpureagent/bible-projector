// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { StyleView } from '../../src/control/style-view'
import { FONT_CHOICES, TEXTURES } from '../../src/shared/style'
import { PROJECTION_THEME_PRESETS } from '../../src/shared/themes'
import type { ProjectionStyle } from '../../src/shared/types'

// T4-style：样式抽屉（§6.2 右抽屉）——预设主题一键套用、全项控件 dispatch、背景图路径校验

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

describe('T4-style 样式抽屉组件', () => {
  it('三套预设主题按钮：一键套用补丁（theme + 清空覆盖）', () => {
    const { root, dispatchStyle } = mount()
    for (const name of ['ink', 'ivory', 'ocean'] as const) {
      const btn = root.querySelector<HTMLButtonElement>(`[data-theme="${name}"]`)
      expect(btn, `应有 ${name} 主题按钮`).toBeTruthy()
      btn!.click()
      expect(dispatchStyle).toHaveBeenCalledWith(PROJECTION_THEME_PRESETS[name])
    }
    expect(dispatchStyle).toHaveBeenCalledTimes(3)
  })

  it('字体四选、行距/字距/对齐/边距控件 dispatch 对应字段', () => {
    const { root, dispatchStyle } = mount()
    const font = root.querySelector<HTMLSelectElement>('[data-field="fontFamily"]')!
    font.value = 'kai'
    font.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ fontFamily: 'kai' })

    const lineHeight = root.querySelector<HTMLInputElement>('[data-field="lineHeight"]')!
    lineHeight.value = '2.1'
    lineHeight.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ lineHeight: 2.1 })

    const align = root.querySelector<HTMLSelectElement>('[data-field="align"]')!
    align.value = 'left'
    align.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ align: 'left' })

    const margin = root.querySelector<HTMLInputElement>('[data-field="margin"]')!
    margin.value = '12'
    margin.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ margin: 12 })
  })

  it('颜色四项：改值 dispatch 覆盖色；重置按钮 dispatch null 回主题 token', () => {
    const { root, dispatchStyle } = mount()
    const color = root.querySelector<HTMLInputElement>('[data-field="color"]')!
    color.value = '#AA0000'
    color.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ color: '#aa0000' }) // DOM 会小写化 hex

    const reset = root.querySelector<HTMLButtonElement>('[data-reset="colors"]')!
    reset.click()
    expect(dispatchStyle).toHaveBeenCalledWith({
      color: null,
      verseNumberColor: null,
      currentColor: null,
      background: null,
    })
  })

  it('内置纹理选项：选中 dispatch builtin:id', () => {
    const { root, dispatchStyle } = mount()
    const bg = root.querySelector<HTMLSelectElement>('[data-field="backgroundImage"]')!
    bg.value = `builtin:${TEXTURES[0]!.id}`
    bg.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ backgroundImage: `builtin:${TEXTURES[0]!.id}` })
  })

  it('自定义路径校验：网络 URL 显示错误且不 dispatch；合法绝对路径 dispatch', () => {
    const { root, dispatchStyle } = mount()
    const bg = root.querySelector<HTMLSelectElement>('[data-field="backgroundImage"]')!
    bg.value = 'custom'
    bg.dispatchEvent(new Event('change'))
    const input = root.querySelector<HTMLInputElement>('[data-field="backgroundImageCustom"]')!
    input.value = 'https://evil.example/bg.png'
    input.dispatchEvent(new Event('change'))
    expect(root.querySelector('.style-error')?.textContent).toBeTruthy()
    expect(dispatchStyle).not.toHaveBeenCalledWith({ backgroundImage: 'https://evil.example/bg.png' })

    input.value = '/data/pics/bg.png'
    input.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ backgroundImage: '/data/pics/bg.png' })
  })

  it('隐藏节号/隐藏标题 dispatch；单节模式开关已废除（无 mode 控件，R2/R4）', () => {
    const { root, dispatchStyle } = mount()
    const hideNums = root.querySelector<HTMLInputElement>('[data-field="hideVerseNumbers"]')!
    hideNums.checked = true
    hideNums.dispatchEvent(new Event('change'))
    expect(dispatchStyle).toHaveBeenCalledWith({ hideVerseNumbers: true })

    expect(root.querySelector('[data-field="mode"]')).toBeNull()
  })

  it('抽屉显隐：setVisible/hidden 属性互切', () => {
    const { view, root } = mount()
    expect(root.hidden).toBe(true)
    view.setVisible(true)
    expect(root.hidden).toBe(false)
    view.setVisible(false)
    expect(root.hidden).toBe(true)
  })

  it('renderState 同步控件值与当前状态一致', () => {
    const { view, root } = mount()
    view.renderState({ ...baseStyle, fontFamily: 'sans', fontSize: 96, align: 'left', margin: 12 })
    expect(root.querySelector<HTMLSelectElement>('[data-field="fontFamily"]')?.value).toBe('sans')
    expect(root.querySelector<HTMLInputElement>('[data-field="fontSize"]')?.value).toBe('96')
    expect(root.querySelector<HTMLSelectElement>('[data-field="align"]')?.value).toBe('left')
    expect(root.querySelector<HTMLInputElement>('[data-field="margin"]')?.value).toBe('12')
  })

  it('字体选项标签含 内嵌宋体/系统宋体/楷体/黑体', () => {
    const { root } = mount()
    const labels = [...root.querySelectorAll('[data-field="fontFamily"] option')].map((o) => o.textContent)
    for (const label of ['内嵌宋体', '系统宋体', '楷体', '黑体']) expect(labels).toContain(label)
    expect(FONT_CHOICES).toHaveLength(4)
  })
})

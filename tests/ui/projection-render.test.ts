// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderProjection } from '../../src/projection/render'
import { chapterVerses } from '../../src/shared/bible'
import { PROJECTION_THEMES } from '../../src/shared/themes'
import type { AppState, Selection } from '../../src/shared/types'

// T3-cascade / T7-flow（R2）：投影窗**自然段落连续流**渲染——节号上标嵌句首、
// 当前节段内句子级点亮、无逐行列表结构、无 U+3000 缝。

const stateWith = (patch: Partial<AppState>): AppState => ({
  selection: null,
  style: {
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
  },
  display: null,
  projecting: false,
  ...patch,
})

const gen11: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 1 } }

function mount(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

describe('T7-flow 投影窗自然段落流渲染', () => {
  it('创 1:1 上屏：正文含「起初，神创造天地。」且整窗无 U+3000', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    expect(root.textContent).toContain('起初，神创造天地。')
    expect(root.textContent).not.toContain('　')
  })

  it('单一 .flow 容器 + 节＝行内片段：无逐行 <p class="verse"> 列表结构（R2）', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: { sn: 1, chapter: 1, verses: { from: 1, to: 3 } } }))
    expect(root.querySelectorAll('.flow')).toHaveLength(1)
    expect(root.querySelectorAll('p.verse')).toHaveLength(0)
    expect(root.querySelectorAll('.flow > .vtext').length).toBe(3)
  })

  it('节号上标嵌句首：sup.vnum 计数=节数、编号升序、样式带节号色', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: { sn: 1, chapter: 1, verses: { from: 1, to: 3 } } }))
    const sups = [...root.querySelectorAll<HTMLElement>('.flow sup.vnum')]
    expect(sups.map((s) => s.textContent)).toEqual(['1', '2', '3'])
    expect(sups[0]?.style.color).toBe(PROJECTION_THEMES.ink!.verseNumber)
    // 上标在正文 span 之前（嵌句首）
    const vtext = root.querySelector<HTMLElement>('.flow .vtext[data-verse="1"]')!
    expect(vtext.previousElementSibling?.className).toBe('vnum')
  })

  it('当前节=段内句子级点亮：vtext.current 带主题高亮字色+底色，且唯一', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: { sn: 1, chapter: 1, verses: { from: 2, to: 3 } } }))
    const currents = [...root.querySelectorAll<HTMLElement>('.flow .vtext.current')]
    expect(currents).toHaveLength(1)
    expect(currents[0]?.dataset.verse).toBe('2')
    expect(currents[0]?.style.color).toBe(PROJECTION_THEMES.ink!.currentColor)
    expect(currents[0]?.style.backgroundColor).toBe(PROJECTION_THEMES.ink!.currentBackground)
  })

  it('墨金主题 token 应用：背景/正文/字号来自 themes.ts 与 style.fontSize', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    expect(root.style.backgroundColor).toBe(PROJECTION_THEMES.ink!.background)
    expect(root.style.color).toBe(PROJECTION_THEMES.ink!.color)
    expect(root.querySelector<HTMLElement>('.passage')?.style.fontSize).toBe('72px')
  })

  it('书卷名与章号出现在标题行（创世记 · 第 1 章）', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    expect(root.querySelector('.passage-title')?.textContent).toContain('创世记')
    expect(root.querySelector('.passage-title')?.textContent).toContain('第 1 章')
  })

  it('T7 R1：黑场遮罩不存在（blank 链路已删）；selection=null → 占位文案', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    expect(root.querySelector('.blank-overlay')).toBeNull()
    const root2 = mount()
    renderProjection(root2, stateWith({ selection: null }))
    expect(root2.querySelector('.placeholder')?.textContent).toBeTruthy()
  })

  it('R2/R4：整段所选范围一次渲染（纵向瀑布流），不再只渲染一页', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: { sn: 19, chapter: 119, verses: { from: 1, to: 12 } } }))
    const sups = [...root.querySelectorAll('.flow sup.vnum')].map((s) => s.textContent)
    expect(sups).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)))
    expect(root.textContent).toContain(chapterVerses(19, 119)[11]!)
  })
})
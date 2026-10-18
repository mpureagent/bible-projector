// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderProjection } from '../../src/projection/render'
import { chapterVerses } from '../../src/shared/bible'
import { PROJECTION_THEMES } from '../../src/shared/themes'
import type { AppState, Selection } from '../../src/shared/types'

// T3-cascade 投影窗渲染（§7.1 墨金主题、节号上标小字、当前节高亮、无 U+3000 缝）

const stateWith = (patch: Partial<AppState>): AppState => ({
  selection: null,
  style: {
    theme: 'ink',
    fontSize: 72,
    mode: 'paragraph',
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

describe('T3-cascade 投影窗经文渲染', () => {
  it('创 1:1 上屏：正文含「起初，神创造天地。」且整窗无 U+3000', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    expect(root.textContent).toContain('起初，神创造天地。')
    expect(root.textContent).not.toContain('　')
  })

  it('节号为上标小字（sup.vnum），当前节带高亮类与主题节号色', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: gen11 }))
    const sup = root.querySelector<HTMLElement>('sup.vnum')
    expect(sup?.textContent).toBe('1')
    const verse = root.querySelector<HTMLElement>('.verse')
    expect(verse?.classList.contains('current')).toBe(true)
    expect(sup?.style.color).toBe(PROJECTION_THEMES.ink!.verseNumber)
  })

  it('范围创 1:1-3：DOM 与数据层一致——当前页首节文本逐字比对、节号升序', () => {
    const root = mount()
    const selection: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 3 } }
    renderProjection(root, stateWith({ selection }))
    const verses = [...root.querySelectorAll<HTMLElement>('.verse')]
    expect(verses.length).toBeGreaterThan(0)
    const nums = verses.map((v) => Number(v.querySelector('sup.vnum')?.textContent))
    expect([...nums]).toEqual([...nums].sort((a, b) => a - b))
    for (let i = 0; i < verses.length; i++) {
      const verseNo = nums[i]!
      expect(verses[i]?.textContent).toContain(chapterVerses(1, 1)[verseNo - 1])
    }
    expect(verses[0]?.textContent).toContain(chapterVerses(1, 1)[0])
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
})

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersesView } from '../../src/control/verses-view'
import { chapterVerses } from '../../src/shared/bible'

// T3-cascade 组件层测试：节列表 + Shift 连选（§6.1 主流程第三击）

function mount() {
  const onSelect = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new VersesView(root, { onSelect })
  return { root, view, onSelect }
}

function verseButton(root: HTMLElement, verse: number): HTMLElement {
  const btn = [...root.querySelectorAll<HTMLElement>('.verse-btn')].find(
    (b) => b.dataset.verse === String(verse),
  )
  if (!btn) throw new Error(`未找到第 ${verse} 节按钮`)
  return btn
}

function shiftClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('T3-cascade 节列表渲染', () => {
  it('选创世记 1 章渲染 31 个节按钮，含节号与经文文本', () => {
    const { root, view } = mount()
    view.setChapter(1, 1)
    expect(root.querySelectorAll('.verse-btn')).toHaveLength(31)
    expect(verseButton(root, 1).textContent).toContain('起初，神创造天地。')
    expect(root.querySelector('.verses-title')?.textContent).toContain('创世记')
    expect(root.querySelector('.verses-title')?.textContent).toContain('第 1 章')
  })

  it('经文文本来自数据层且不含 U+3000', () => {
    const { root, view } = mount()
    view.setChapter(1, 1)
    const texts = [...root.querySelectorAll<HTMLElement>('.verse-btn')].map((b) => b.textContent ?? '')
    for (let i = 0; i < texts.length; i++) {
      expect(texts[i]).toContain(chapterVerses(1, 1)[i])
      expect(texts[i]).not.toContain('　')
    }
  })
})

describe('T3-cascade 点击节上屏与 Shift 连选', () => {
  it('点击第 2 节 → onSelect 收到单节 Selection(sn=1,chapter=1,2:2)', () => {
    const { root, view, onSelect } = mount()
    view.setChapter(1, 1)
    verseButton(root, 2).click()
    expect(onSelect).toHaveBeenCalledWith({ sn: 1, chapter: 1, verses: { from: 2, to: 2 } })
  })

  it('点击第 2 节后 Shift 点击第 5 节 → 范围 2:5', () => {
    const { root, view, onSelect } = mount()
    view.setChapter(1, 1)
    verseButton(root, 2).click()
    shiftClick(verseButton(root, 5))
    expect(onSelect).toHaveBeenLastCalledWith({ sn: 1, chapter: 1, verses: { from: 2, to: 5 } })
  })

  it('Shift 反向连选（锚 5 → Shift 点 2）→ 范围仍为 2:5', () => {
    const { root, view, onSelect } = mount()
    view.setChapter(1, 1)
    verseButton(root, 5).click()
    shiftClick(verseButton(root, 2))
    expect(onSelect).toHaveBeenLastCalledWith({ sn: 1, chapter: 1, verses: { from: 2, to: 5 } })
  })

  it('跨章禁止：切换章节后锚点重置，Shift 点击产生单节选择', () => {
    const { root, view, onSelect } = mount()
    view.setChapter(1, 1)
    verseButton(root, 2).click()
    view.setChapter(1, 2)
    shiftClick(verseButton(root, 3))
    expect(onSelect).toHaveBeenLastCalledWith({ sn: 1, chapter: 2, verses: { from: 3, to: 3 } })
  })

  it('连选高亮：范围内节按钮带 in-range 类', () => {
    const { root, view } = mount()
    view.setChapter(1, 1)
    verseButton(root, 2).click()
    shiftClick(verseButton(root, 5))
    const inRange = [...root.querySelectorAll<HTMLElement>('.verse-btn.in-range')].map(
      (b) => b.dataset.verse,
    )
    expect(inRange).toEqual(['2', '3', '4', '5'])
  })
})

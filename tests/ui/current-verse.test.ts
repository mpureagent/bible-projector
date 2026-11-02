// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { PreviewView } from '../../src/control/preview-view'
import { StyleView } from '../../src/control/style-view'
import { renderProjection } from '../../src/projection/render'
import { pickTopVerse, verseAtTop } from '../../src/projection/scroll'
import { PROJECTION_THEMES } from '../../src/shared/themes'
import { resolveCurrentVerse, VERSE_ATTR } from '../../src/shared/passage'
import type { AppState, ProjectionStyle, Selection } from '../../src/shared/types'

// W3：currentVerse 渲染路径——取值来源、hideCurrent、增量更新、顶部第一行取节。

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

const range: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 21 } }

const stateWith = (patch: Partial<AppState> = {}, style: Partial<ProjectionStyle> = {}): AppState => ({
  selection: null,
  style: { ...baseStyle, ...style },
  display: null,
  projecting: false,
  ...patch,
})

function mount(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

const currentOf = (root: HTMLElement): string | null =>
  root.querySelector<HTMLElement>('.vtext.current')?.getAttribute(VERSE_ATTR) ?? null

describe('W3 当前节取值来源（与 selection 解耦）', () => {
  it('resolveCurrentVerse 只认 currentVerse；旧状态缺字段才回落到 from', () => {
    expect(resolveCurrentVerse(stateWith({ selection: range, currentVerse: 19 }))).toBe(19)
    expect(resolveCurrentVerse(stateWith({ selection: range }))).toBe(16)
    expect(resolveCurrentVerse(stateWith({ selection: range, currentVerse: null }))).toBeNull()
    expect(resolveCurrentVerse(stateWith({ selection: null, currentVerse: 3 }))).toBeNull()
  })

  it('currentVerse 越界（脏状态）不渲染空高亮', () => {
    expect(resolveCurrentVerse(stateWith({ selection: range, currentVerse: 15 }))).toBeNull()
    expect(resolveCurrentVerse(stateWith({ selection: range, currentVerse: 22 }))).toBeNull()
  })

  it('投影点亮的是 currentVerse，而不是 selection.from', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: range, currentVerse: 19 }))
    expect(currentOf(root)).toBe('19')
    expect(root.querySelectorAll('.vtext.current')).toHaveLength(1)
  })

  it('hideCurrent=true：整段无 .current，且无内联高亮色', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: range, currentVerse: 19 }, { hideCurrent: true }))
    expect(root.querySelectorAll('.vtext.current')).toHaveLength(0)
    const verse = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="19"]`)!
    expect(verse.style.color).toBe('')
    expect(verse.style.backgroundColor).toBe('')
  })

  it('hideCurrent 缺省：正常点亮主题高亮色', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: range, currentVerse: 19 }))
    const verse = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="19"]`)!
    expect(verse.style.color).toBe(PROJECTION_THEMES.ink!.currentColor)
    expect(verse.style.backgroundColor).toBe(PROJECTION_THEMES.ink!.currentBackground)
  })
})

describe('W3 增量渲染硬约束（不重建 DOM）', () => {
  it('仅 currentVerse 变化：同一节点引用不变，只切换 .current', () => {
    const root = mount()
    const selection = range
    const style = { ...baseStyle }
    renderProjection(root, stateWith({ selection, currentVerse: 16, style }))
    const before = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)!
    const rebuilt = renderProjection(root, stateWith({ selection, currentVerse: 17, style }))
    expect(rebuilt).toBe(false)
    expect(root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)).toBe(before)
    expect(before.classList.contains('current')).toBe(false)
    expect(currentOf(root)).toBe('17')
  })

  it('状态回包是克隆对象（值相同）也不重建：节点引用不变', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: range, currentVerse: 16, style: { ...baseStyle } }))
    const before = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="18"]`)!
    const clonedSelection: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 21 } }
    const rebuilt = renderProjection(root, stateWith({ selection: clonedSelection, currentVerse: 18, style: { ...baseStyle } }))
    expect(rebuilt).toBe(false)
    expect(root.querySelector<HTMLElement>(`[${VERSE_ATTR}="18"]`)).toBe(before)
    expect(currentOf(root)).toBe('18')
  })

  it('selection 变化才整段重建（旧节点脱离文档）', () => {
    const root = mount()
    const style = { ...baseStyle }
    renderProjection(root, stateWith({ selection: range, currentVerse: 16, style }))
    const before = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)!
    const next: Selection = { sn: 43, chapter: 3, verses: { from: 17, to: 21 } }
    const rebuilt = renderProjection(root, stateWith({ selection: next, currentVerse: 17, style }))
    expect(rebuilt).toBe(true)
    expect(root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)).toBeNull()
    expect(before.isConnected).toBe(false)
  })

  it('style 变化才整段重建', () => {
    const root = mount()
    const selection = range
    renderProjection(root, stateWith({ selection, currentVerse: 16, style: { ...baseStyle } }))
    const before = root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)!
    const rebuilt = renderProjection(
      root,
      stateWith({ selection, currentVerse: 16, style: { ...baseStyle, fontSize: 90 } }),
    )
    expect(rebuilt).toBe(true)
    expect(root.querySelector<HTMLElement>(`[${VERSE_ATTR}="16"]`)).not.toBe(before)
  })
})

describe('W3 顶部第一行取节', () => {
  it('pickTopVerse：第一个与视口顶部相交的节（含跨过顶边的节）', () => {
    const rects = [
      { verse: 1, top: -60, bottom: -10 }, // 完全在上方
      { verse: 2, top: -10, bottom: 40 }, // 跨过顶边 → 命中
      { verse: 3, top: 40, bottom: 90 },
    ]
    expect(pickTopVerse(rects, 0)).toBe(2)
    expect(pickTopVerse(rects, -100)).toBe(1)
    expect(pickTopVerse(rects, 100)).toBeNull()
  })

  it('verseAtTop：以滚动容器顶边为视口顶，按 DOM 顺序取节', () => {
    const root = mount()
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ top: 100, bottom: 600, left: 0, right: 800, width: 800, height: 500, x: 0, y: 100 }),
    })
    const boxes = [
      { verse: 5, top: 40, bottom: 90 },
      { verse: 6, top: 120, bottom: 170 },
      { verse: 7, top: 170, bottom: 220 },
    ]
    for (const box of boxes) {
      const el = document.createElement('span')
      el.className = 'vtext'
      el.setAttribute(VERSE_ATTR, String(box.verse))
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({
          top: box.top,
          bottom: box.bottom,
          left: 0,
          right: 100,
          width: 100,
          height: box.bottom - box.top,
          x: 0,
          y: box.top,
        }),
      })
      root.appendChild(el)
    }
    expect(verseAtTop(root)).toBe(6)
  })
})

describe('W3 预览与投影同源', () => {
  it('预览点亮的状态 currentVerse 与投影一致，且高亮变化不重建', () => {
    const previewRoot = mount()
    const onHighlight = vi.fn()
    const view = new PreviewView(previewRoot, { onHighlight })
    const selection = range
    const style = { ...baseStyle }
    view.render(stateWith({ selection, currentVerse: 18, style }))
    expect(currentOf(previewRoot)).toBe('18')
    const node = previewRoot.querySelector<HTMLElement>(`[${VERSE_ATTR}="18"]`)!
    view.render(stateWith({ selection, currentVerse: 19, style }))
    expect(previewRoot.querySelector<HTMLElement>(`[${VERSE_ATTR}="18"]`)).toBe(node)
    expect(currentOf(previewRoot)).toBe('19')

    const projectionRoot = mount()
    renderProjection(projectionRoot, stateWith({ selection, currentVerse: 19, style }))
    expect(currentOf(projectionRoot)).toBe(currentOf(previewRoot))
  })

  it('点击预览某节 → onHighlight(该节)，selection 不变', () => {
    const root = mount()
    const onHighlight = vi.fn()
    const view = new PreviewView(root, { onHighlight })
    const selection = { ...range, verses: { from: 16, to: 21 } }
    view.render(stateWith({ selection, currentVerse: 16 }))
    root.querySelector<HTMLElement>(`[${VERSE_ATTR}="19"]`)!.click()
    expect(onHighlight).toHaveBeenCalledWith(19)
    expect(view.getSelection()).toEqual(selection)
  })
})

describe('W3 样式面板「显隐」区块', () => {
  it('隐藏当前节高亮开关 dispatch hideCurrent，并随状态回显', () => {
    const root = document.createElement('aside')
    document.body.appendChild(root)
    const onPatch = vi.fn()
    const view = new StyleView(root, { onPatch })
    const checkbox = root.querySelector<HTMLInputElement>('[data-field="hideCurrent"]')!
    expect(checkbox).toBeTruthy()
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    expect(onPatch).toHaveBeenCalledWith({ hideCurrent: true })
    view.renderState({ ...baseStyle, hideCurrent: true })
    expect(checkbox.checked).toBe(true)
  })
})
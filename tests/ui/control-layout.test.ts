// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewView } from '../../src/control/preview-view'
import { ThemePalette } from '../../src/control/theme-palette'
import { SearchView } from '../../src/control/search-view'
import { chapterVerses } from '../../src/shared/bible'
import { passageText } from '../../src/shared/passage'
import { PROJECTION_THEMES } from '../../src/shared/themes'
import type { AppState, ProjectionStyle, Selection, ThemeName } from '../../src/shared/types'

// T7-layout（R3/R6）：控制窗重排——左栏搜索→Tab→书卷每卷一行全名；右栏操作条+预览；
// 底部状态条删除；预览与投影同源渲染（修复问题 6「主题不生效」）；预览文本可选中可复制。

const html = readFileSync('src/control/index.html', 'utf-8')

const baseStyle: ProjectionStyle = {
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
}

const gen11: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 3 } }

const stateWith = (patch: Partial<AppState> = {}, style: Partial<ProjectionStyle> = {}): AppState => ({
  selection: gen11,
  style: { ...baseStyle, ...style },
  display: null,
  projecting: false,
  ...patch,
})

function mount(tag = 'div'): HTMLElement {
  const root = document.createElement(tag)
  document.body.appendChild(root)
  return root
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('T7-layout 控制窗 DOM 结构（R3）', () => {
  it('左栏：搜索框在顶、Tab 紧随、书卷列表在后（顺序断言）', () => {
    const iSearch = html.indexOf('id="search-panel"')
    const iBooks = html.indexOf('id="books-panel"')
    const iHistory = html.indexOf('id="history-panel"')
    expect(iSearch).toBeGreaterThan(-1)
    expect(iBooks).toBeGreaterThan(iSearch)
    expect(iHistory).toBeGreaterThan(iBooks)
  })

  it('右栏操作条（预览顶上）按钮齐全且左→右顺序正确', () => {
    const order = ['btn-project', 'btn-selection', 'btn-copy', 'btn-font-down', 'btn-font-up', 'theme-palette', 'btn-style']
    const idx = order.map((id) => html.indexOf(`id="${id}"`))
    for (const [i, at] of idx.entries()) expect(at, `缺少 ${order[i]}`).toBeGreaterThan(-1)
    expect([...idx]).toEqual([...idx].sort((a, b) => a - b))
  })

  it('底部状态条 DOM 已删除（R3）：无 st-* 状态节点、无 controls-box', () => {
    for (const id of ['st-selection', 'st-projecting', 'st-style', 'st-display']) {
      expect(html).not.toContain(`id="${id}"`)
    }
    expect(html).not.toContain('controls-box')
    expect(html).not.toContain('主题切换')
  })

  it('预览区文本可选中（R3）：user-select: text 且无 user-select: none', () => {
    expect(html).toMatch(/#preview-panel[^}]*user-select:\s*text/)
    expect(html).not.toMatch(/user-select:\s*none/)
  })
})

describe('T7-layout 预览与投影同源渲染（修复问题 6）', () => {
  it('预览按选区渲染经文正文（同源排版核）', () => {
    const root = mount()
    const view = new PreviewView(root)
    view.render(stateWith())
    expect(root.querySelector('.passage')).toBeTruthy()
    expect(root.textContent).toContain(chapterVerses(1, 1)[0])
  })

  it('主题切换 → 预览 computed 底色/字色全等 themes.ts token（问题 6 回归）', () => {
    const root = mount()
    const view = new PreviewView(root)
    for (const theme of ['ink', 'ivory', 'ocean'] as ThemeName[]) {
      view.render(stateWith({}, { theme }))
      expect(root.style.backgroundColor).toBe(PROJECTION_THEMES[theme]!.background)
      expect(root.style.color).toBe(PROJECTION_THEMES[theme]!.color)
    }
  })

  it('样式状态同步预览：行距/字距/对齐/字号缩放跟随', () => {
    const root = mount()
    const view = new PreviewView(root)
    view.render(stateWith({}, { lineHeight: 2.2, letterSpacing: 0.1, align: 'left', fontSize: 100 }))
    const passage = root.querySelector<HTMLElement>('.passage')!
    expect(passage.style.lineHeight).toBe('2.2')
    expect(passage.style.letterSpacing).toBe('0.1em')
    expect(passage.style.textAlign).toBe('left')
    expect(Number.parseFloat(passage.style.fontSize)).toBeLessThan(100)
  })

  it('无选区 → 预览占位且可复制为 no-op', async () => {
    const root = mount()
    const copyText = vi.fn()
    const view = new PreviewView(root, { copyText })
    view.render(stateWith({ selection: null }))
    expect(root.querySelector('.preview-empty')).toBeTruthy()
    await expect(view.copyCurrent()).resolves.toBeNull()
    expect(copyText).not.toHaveBeenCalled()
  })
})

describe('T7-layout 复制经文（R3：从预览复制为真实场景）', () => {
  it('复制按钮载荷 = passageText（参考行 + 逐节文本）', async () => {
    const root = mount()
    const copied: string[] = []
    const view = new PreviewView(root, { copyText: (t) => void copied.push(t) })
    view.render(stateWith())
    await view.copyCurrent()
    expect(copied).toEqual([passageText(gen11)])
    expect(copied[0]).toContain('创世记 1:1-3')
    expect(copied[0]).toContain(chapterVerses(1, 1)[0]!)
  })

  it('selection API 冒烟：预览正文为真实文本节点，可被 Range 选取', () => {
    const root = mount()
    const view = new PreviewView(root)
    view.render(stateWith())
    const body = root.querySelector('.verse .vtext')!
    const range = document.createRange()
    range.selectNodeContents(body)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    expect(sel?.toString()).toContain(chapterVerses(1, 1)[0])
  })
})

describe('T7-layout 主题色板选择器（R3/R5）', () => {
  it('每套主题一个色块；数量 = PROJECTION_THEMES 套数（T7-style 后为 8）', () => {
    const root = mount()
    new ThemePalette(root, { onSelect: () => {} })
    const swatches = [...root.querySelectorAll<HTMLElement>('.theme-swatch')]
    expect(swatches).toHaveLength(Object.keys(PROJECTION_THEMES).length)
    for (const sw of swatches) {
      const theme = PROJECTION_THEMES[sw.dataset.theme!]!
      expect(sw.style.backgroundColor).toBe(theme.background)
      expect(sw.style.color).toBe(theme.color)
    }
  })

  it('点击色块 → onSelect(theme)；renderState 标记 active', () => {
    const root = mount()
    const onSelect = vi.fn()
    const palette = new ThemePalette(root, { onSelect })
    root.querySelector<HTMLElement>('[data-theme="ink"]')!.click()
    expect(onSelect).toHaveBeenCalledWith('ink')
    palette.renderState('ivory')
    expect(root.querySelector('[data-theme="ivory"]')?.classList.contains('active')).toBe(true)
    expect(root.querySelector('[data-theme="ink"]')?.classList.contains('active')).toBe(false)
  })
})

describe('T7-layout 搜索下拉前缀高亮（R6）', () => {
  it('命中前缀包裹在 <mark class="search-hl"> 中', () => {
    const root = mount()
    new SearchView(root, { onBook: () => {} })
    const input = root.querySelector<HTMLInputElement>('.search-input')!
    input.value = '创'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const mark = root.querySelector('.search-item .search-hl')
    expect(mark?.textContent).toBe('创')
    expect(root.querySelector('.search-item-name')?.textContent).toContain('创世记')
  })
})
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ControlLayout,
  NARROW_MEDIA_QUERY,
  type LayoutMediaQuery,
} from '../../src/control/layout-controller'
import type { Selection } from '../../src/shared/types'

// W2：窄屏单栏两态（list/detail）——选择/返回/桌面回归；隐藏用 hidden 属性，元素留在 DOM。

const html = readFileSync('src/control/index.html', 'utf-8')

const selJohn: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 17 } }
const selGen: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 3 } }

class FakeMedia implements LayoutMediaQuery {
  matches: boolean
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener)
  }

  emit(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) listener({ matches } as MediaQueryListEvent)
  }
}

function mount(narrow: boolean) {
  document.body.innerHTML = `
    <div id="layout">
      <div id="left-panel"></div>
      <div id="right-panel">
        <button id="btn-back" hidden>‹ 返回列表</button>
        <div id="op-bar"></div>
        <div id="preview-wrap"><div id="preview-panel"></div></div>
      </div>
    </div>`
  const left = document.getElementById('left-panel')!
  const right = document.getElementById('right-panel')!
  const back = document.getElementById('btn-back')!
  const preview = document.getElementById('preview-panel')!
  const media = new FakeMedia(narrow)
  const layout = new ControlLayout({ body: document.body, left, right, back }, media)
  return { layout, media, left, right, back, preview }
}

const stateWith = (selection: Selection | null) => ({ selection })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('W2 窄屏状态机 list ↔ detail', () => {
  it('窄屏初始为 list：书卷栏可见、预览栏 hidden、无返回按钮', () => {
    const { layout, left, right, back } = mount(true)
    expect(layout.isNarrow()).toBe(true)
    expect(layout.getView()).toBe('list')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(true)
    expect(back.hidden).toBe(true)
  })

  it('选中经文后自动进入 detail：预览栏可见、返回按钮出现', () => {
    const { layout, left, right, back } = mount(true)
    layout.handleState(stateWith(null))
    layout.handleState(stateWith(selJohn))
    expect(layout.getView()).toBe('detail')
    expect(left.hidden).toBe(true)
    expect(right.hidden).toBe(false)
    expect(back.hidden).toBe(false)
  })

  it('detail 下返回 → 回 list；同选区状态更新不会把用户拽回 detail', () => {
    const { layout, left, right, back } = mount(true)
    layout.handleState(stateWith(null))
    layout.handleState(stateWith(selJohn))
    layout.backToList()
    expect(layout.getView()).toBe('list')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(true)
    expect(back.hidden).toBe(true)
    // 主题/投屏等状态刷新携带同一选区，不得自动切回 detail
    layout.handleState(stateWith(selJohn))
    expect(layout.getView()).toBe('list')
  })

  it('初始 hydration 已带选区也停在 list（验收：初始态看得到书卷列表）', () => {
    const { layout, left, right } = mount(true)
    layout.handleState(stateWith(selGen))
    expect(layout.getView()).toBe('list')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(true)
    // 下一次真正换选区才进 detail
    layout.handleState(stateWith(selJohn))
    expect(layout.getView()).toBe('detail')
  })

  it('PC 宽度：双栏都在、无返回按钮，即使内部 view=detail', () => {
    const { layout, left, right, back } = mount(false)
    layout.handleState(stateWith(null))
    layout.handleState(stateWith(selJohn))
    expect(layout.isNarrow()).toBe(false)
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(false)
    expect(back.hidden).toBe(true)
    layout.setView('detail')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(false)
    expect(back.hidden).toBe(true)
  })

  it('视口跨断点：缩到窄屏时有选区 → detail；放回桌面 → 双栏且无返回', () => {
    const { layout, media, left, right, back } = mount(false)
    layout.handleState(stateWith(null))
    layout.handleState(stateWith(selJohn))
    media.emit(true)
    expect(layout.isNarrow()).toBe(true)
    expect(layout.getView()).toBe('detail')
    expect(left.hidden).toBe(true)
    expect(right.hidden).toBe(false)
    expect(back.hidden).toBe(false)
    media.emit(false)
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(false)
    expect(back.hidden).toBe(true)
  })

  it('隐藏用 hidden 属性而非内联 display:none；预览元素始终留在 DOM', () => {
    const { layout, left, right, preview, back } = mount(true)
    layout.handleState(stateWith(null))
    layout.handleState(stateWith(selJohn))
    layout.backToList()
    expect(right.hidden).toBe(true)
    expect(right.style.display).toBe('')
    expect(left.style.display).toBe('')
    expect(back.style.display).toBe('')
    expect(right.hasAttribute('style')).toBe(false)
    expect(preview.isConnected).toBe(true)
    expect(right.contains(preview)).toBe(true)
    // detail 时同样不靠内联样式
    layout.setView('detail')
    expect(right.hidden).toBe(false)
    expect(right.style.display).toBe('')
  })

  it('媒体查询断点为 (max-width: 900px)', () => {
    expect(NARROW_MEDIA_QUERY).toBe('(max-width: 900px)')
  })
})

describe('W2 窄屏布局 CSS 根因与触控', () => {
  const narrowCss = (() => {
    const at = html.indexOf('@media (max-width: 900px)')
    if (at < 0) return ''
    const start = html.indexOf('{', at)
    let depth = 0
    for (let i = start; i < html.length; i++) {
      if (html[i] === '{') depth++
      else if (html[i] === '}') {
        depth--
        if (depth === 0) return html.slice(at, i + 1)
      }
    }
    return html.slice(at)
  })()

  it('主体网格用 minmax(0, 1fr)，左右栏 min-width: 0（治 min-content 撑破）', () => {
    expect(html).toMatch(/#layout\s*\{[^}]*grid-template-columns:\s*340px\s+minmax\(0,\s*1fr\)/)
    expect(html).toMatch(/#left-panel,\s*#right-panel\s*\{[^}]*min-width:\s*0/)
    expect(narrowCss).toMatch(/#layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it('窄屏样式面板为贴底抽屉：max-height: 70vh + bottom: 0', () => {
    expect(narrowCss).toMatch(/\.style-panel\s*\{[^}]*bottom:\s*0[^}]*max-height:\s*70vh/)
  })

  it('窄屏所有可点元素触控区 ≥ 44px', () => {
    for (const selector of [
      '.book-btn',
      '.tab-btn',
      '.search-item',
      '.history-item',
      '.cascade-verse',
      '.cascade-chapter',
      '.style-close',
      '.theme-swatch',
      '.op-small',
      '.op-icon',
      '.back-btn',
    ]) {
      expect(narrowCss).toMatch(new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*44px`))
    }
    expect(narrowCss).toMatch(/\.theme-swatch\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/)
  })

  it('预览面板不用 display:none 隐藏（用 hidden 属性驱动）', () => {
    expect(html).not.toMatch(/#preview-panel[^{]*\{[^}]*display:\s*none/)
    expect(html).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/)
  })
})
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryView } from '../../src/control/history-view'
import type { Selection } from '../../src/shared/types'

// T3-history 组件层测试：历史列表渲染 + 一键回跳上屏

function mount() {
  const onSelect = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const formatTime = vi.fn((at: number) => `[T${at}]`)
  const view = new HistoryView(root, { onSelect, formatTime })
  return { root, view, onSelect, formatTime }
}

const gen11: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 1 } }
const mark2: Selection = { sn: 41, chapter: 2, verses: { from: 3, to: 5 } }

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('T3-history 历史列表渲染', () => {
  it('渲染 3 条：书名来自数据层（创世记/马可福音）、章:节范围、时间经注入的格式化函数', () => {
    const { root, view } = mount()
    const at = 1791763921850
    view.render([
      { selection: gen11, at },
      { selection: mark2, at: at + 1 },
      { selection: { sn: 19, chapter: 23, verses: { from: 1, to: 1 } }, at: at + 2 },
    ])
    const items = [...root.querySelectorAll<HTMLElement>('.history-item')]
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain('创世记')
    expect(items[0]?.textContent).toContain('1:1')
    expect(items[0]?.textContent).toContain(`[T${at}]`)
    expect(items[1]?.textContent).toContain('马可福音')
    expect(items[1]?.textContent).toContain('2:3-5')
    expect(items[2]?.textContent).toContain('诗篇')
  })

  it('点击条目 → onSelect(该条 selection)（回跳上屏）', () => {
    const { root, view, onSelect } = mount()
    view.render([{ selection: mark2, at: 1 }])
    root.querySelector<HTMLElement>('.history-item')?.click()
    expect(onSelect).toHaveBeenCalledWith(mark2)
  })

  it('空历史显示占位文案', () => {
    const { root, view } = mount()
    view.render([])
    expect(root.querySelector('.history-empty')?.textContent).toBeTruthy()
    expect(root.querySelectorAll('.history-item')).toHaveLength(0)
  })

  it('时间格式化默认实现可用（未注入时不抛错）', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HistoryView(root, { onSelect: () => {} })
    view.render([{ selection: gen11, at: Date.now() }])
    expect(root.querySelector<HTMLElement>('.history-item')?.textContent).toContain('创世记')
  })
})

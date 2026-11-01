// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CascadeView } from '../../src/control/cascade-view'
import type { Selection } from '../../src/shared/types'

// W2：窄屏级联弹窗改分步（书 → 章 → 节范围），禁止横向滚动；桌面四列零变化。

const html = readFileSync('src/control/index.html', 'utf-8')

function mount(narrow: boolean) {
  document.body.innerHTML = ''
  const onSelect = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new CascadeView(root, { onSelect, narrow })
  const dialog = () => root.querySelector<HTMLElement>('.cascade-dialog')!
  const column = (label: string) =>
    [...dialog().querySelectorAll<HTMLElement>('.cascade-col')].find(
      (col) => col.querySelector('.cascade-col-title')?.textContent === label,
    )!
  const click = (selector: string, text: string, kind?: 'from' | 'to') => {
    const btn = [...dialog().querySelectorAll<HTMLElement>(selector)].find(
      (el) => el.textContent === text && (kind === undefined || el.dataset.kind === kind),
    )
    expect(btn, `应存在 ${selector}「${text}」`).toBeTruthy()
    btn!.click()
  }
  return { root, view, onSelect, dialog, column, click }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('W2 窄屏级联：分步书 → 章 → 节范围', () => {
  it('openWithBook 窄屏直接进入章步骤：仅章列可见，其余列 hidden（仍在 DOM）', () => {
    const { view, dialog, column } = mount(true)
    view.openWithBook(1)
    expect(dialog().classList.contains('narrow')).toBe(true)
    expect(column('书卷').hidden).toBe(true)
    expect(column('章').hidden).toBe(false)
    expect(column('起始节').hidden).toBe(true)
    expect(column('结束节').hidden).toBe(true)
    expect(dialog().querySelector<HTMLElement>('.cascade-step-back')!.hidden).toBe(false)
    expect(dialog().querySelector('.cascade-title')?.textContent).toContain('选择章')
    // 隐藏列仍在 DOM 中
    expect(column('书卷').isConnected).toBe(true)
    expect(column('书卷').querySelectorAll('.cascade-book').length).toBeGreaterThan(0)
  })

  it('完整流程：书 → 章 → 起始节 → 结束节，窄屏节范围为双列且无横向滚动', () => {
    const { view, dialog, column, click, onSelect } = mount(true)
    view.open(null)
    expect(column('书卷').hidden).toBe(false)
    expect(column('章').hidden).toBe(true)
    click('.cascade-book', '创世记')
    expect(column('书卷').hidden).toBe(true)
    expect(column('章').hidden).toBe(false)
    click('.cascade-chapter', '1')
    expect(column('章').hidden).toBe(true)
    expect(column('起始节').hidden).toBe(false)
    expect(column('结束节').hidden).toBe(false)
    expect(dialog().querySelector<HTMLElement>('.cascade-cols')!.classList.contains('step-verses')).toBe(true)
    click('.cascade-verse', '1', 'from')
    click('.cascade-verse', '3', 'to')
    expect(onSelect).toHaveBeenCalledWith({ sn: 1, chapter: 1, verses: { from: 1, to: 3 } })
    expect(view.isOpen()).toBe(false)
  })

  it('「‹ 上一步」逐级返回：节范围 → 章 → 书，返回后清空后续步骤', () => {
    const { view, dialog, column, click } = mount(true)
    view.open(null)
    click('.cascade-book', '创世记')
    click('.cascade-chapter', '1')
    click('.cascade-verse', '5', 'from')
    const back = dialog().querySelector<HTMLElement>('.cascade-step-back')!
    back.click()
    expect(column('章').hidden).toBe(false)
    expect(column('起始节').hidden).toBe(true)
    expect(view.getSelection()).toBeNull()
    back.click()
    expect(column('书卷').hidden).toBe(false)
    expect(column('章').hidden).toBe(true)
    expect(back.hidden).toBe(true)
  })

  it('窄屏 ✕ 与遮罩仍可关闭弹窗', () => {
    const a = mount(true)
    a.view.openWithBook(1)
    a.dialog().querySelector<HTMLElement>('.cascade-close')!.click()
    expect(a.view.isOpen()).toBe(false)

    const b = mount(true)
    b.view.openWithBook(1)
    b.root.querySelector<HTMLElement>('.cascade-mask')!.click()
    expect(b.view.isOpen()).toBe(false)
  })

  it('桌面 >900px：四列全可见、无上一步、无 narrow 类（零变化）', () => {
    const { view, dialog, column } = mount(false)
    view.open(null)
    expect(dialog().classList.contains('narrow')).toBe(false)
    for (const label of ['书卷', '章', '起始节', '结束节']) {
      expect(column(label).hidden).toBe(false)
    }
    expect(dialog().querySelector<HTMLElement>('.cascade-step-back')!.hidden).toBe(true)
  })

  it('运行时跨断点 setNarrow：按当前进度落到对应步骤', () => {
    const { view, column } = mount(false)
    view.openWithBook(43)
    view.setNarrow(true)
    expect(column('章').hidden).toBe(false)
    expect(column('书卷').hidden).toBe(true)
    view.setNarrow(false)
    expect(column('书卷').hidden).toBe(false)

    // 已完成选区的回填在窄屏直接落到节范围
    const prefill: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 17 } }
    const second = mount(false)
    second.view.open(prefill)
    second.view.setNarrow(true)
    expect(second.column('起始节').hidden).toBe(false)
    expect(second.column('结束节').hidden).toBe(false)
    expect(second.dialog().querySelector<HTMLElement>('.cascade-step-back')!.hidden).toBe(false)
  })

  it('窄屏 CSS：级联列单列/节范围双列，且无 overflow-x auto/scroll', () => {
    const at = html.indexOf('@media (max-width: 900px)')
    const start = html.indexOf('{', at)
    let depth = 0
    let end = html.length
    for (let i = start; i < html.length; i++) {
      if (html[i] === '{') depth++
      else if (html[i] === '}') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    const narrowCss = html.slice(at, end)
    expect(narrowCss).toMatch(/\.cascade-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(narrowCss).toMatch(
      /\.cascade-cols\.step-verses\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    )
    expect(html).not.toMatch(/cascade[^{]*\{[^}]*overflow-x:\s*(auto|scroll)/)
  })
})
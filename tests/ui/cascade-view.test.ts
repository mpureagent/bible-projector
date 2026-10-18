// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CascadeView } from '../../src/control/cascade-view'
import type { Selection } from '../../src/shared/types'

// T7-cascade（R2 定稿）：四列级联弹窗——列刷新、起止钳制、回填修改、选完自动关窗、
// 三途径关闭、不跨章（结构级）

function mount() {
  const onSelect = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new CascadeView(root, { onSelect })
  return { root, view, onSelect }
}

const click = (view: CascadeView, kind: 'book' | 'chapter' | 'from' | 'to', text: string): void => {
  const dlg = document.querySelector<HTMLElement>('.cascade-dialog')
  expect(dlg).toBeTruthy()
  const selector =
    kind === 'book' ? '.cascade-book' : kind === 'chapter' ? '.cascade-chapter' : '.cascade-verse'
  const btn = [...dlg!.querySelectorAll<HTMLElement>(selector)].find(
    (b) =>
      b.textContent === text &&
      (kind === 'from' || kind === 'to' ? b.dataset.kind === kind : true),
  )
  expect(btn, `级联列 ${kind} 应含「${text}」`).toBeTruthy()
  btn!.click()
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('T7-cascade 四列级联选经', () => {
  it('级联列刷新：点书卷→章列出现该卷章数；点章→起/止列出现该章节号', () => {
    const { view } = mount()
    view.open(null)
    click(view, 'book', '创世记')
    const dlg = document.querySelector<HTMLElement>('.cascade-dialog')!
    expect([...dlg.querySelectorAll('.cascade-chapter')]).toHaveLength(50)
    click(view, 'chapter', '1')
    expect([...dlg.querySelectorAll('.cascade-verse[data-kind="from"]')]).toHaveLength(31)
    // 结束列在起始未选时为提示，不渲染节号
    expect([...dlg.querySelectorAll('.cascade-verse[data-kind="to"]')]).toHaveLength(0)
    expect(dlg.querySelector('.cascade-hint')?.textContent).toBe('先选起始节')
  })

  it('完整流程：书→章→起始→结束 → onSelect((sn,chapter,from,to)) 且弹窗自动关闭', () => {
    const { view, onSelect } = mount()
    view.openWithBook(1)
    click(view, 'chapter', '1')
    click(view, 'from', '1')
    click(view, 'to', '3')
    expect(onSelect).toHaveBeenCalledWith({ sn: 1, chapter: 1, verses: { from: 1, to: 3 } })
    expect(view.isOpen()).toBe(false)
  })

  it('起止钳制：先选起始 5，结束列只渲染 ≥5；选结束 2 被钳到 5', () => {
    const { view, onSelect } = mount()
    view.openWithBook(1)
    click(view, 'chapter', '1')
    click(view, 'from', '5')
    const dlg = document.querySelector<HTMLElement>('.cascade-dialog')!
    const toNums = [...dlg.querySelectorAll('.cascade-verse[data-kind="to"]')].map((b) => b.textContent)
    expect(toNums).toEqual(['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'])
    click(view, 'to', '5')
    expect(onSelect).toHaveBeenCalledWith({ sn: 1, chapter: 1, verses: { from: 5, to: 5 } })
  })

  it('回填修改：open(selection) 四列预置；改起始节后原结束<新起始被钳制抬升', () => {
    const { view, onSelect } = mount()
    const prefill: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 17 } }
    view.open(prefill)
    const dlg = document.querySelector<HTMLElement>('.cascade-dialog')!
    expect(dlg.querySelector('.cascade-book.selected')?.textContent).toBe('约翰福音')
    expect(dlg.querySelector('.cascade-chapter.selected')?.textContent).toBe('3')
    // 修改起始到 18：结束 17 < 18 → 钳到 18
    click(view, 'from', '18')
    click(view, 'to', '18')
    expect(onSelect).toHaveBeenCalledWith({ sn: 43, chapter: 3, verses: { from: 18, to: 18 } })
  })

  it('回填后选完自动关窗：改选起始即可（结束沿用回填值直接选当前结束）', () => {
    const { view, onSelect } = mount()
    view.open({ sn: 1, chapter: 1, verses: { from: 1, to: 3 } })
    click(view, 'from', '2')
    click(view, 'to', '3')
    expect(onSelect).toHaveBeenCalledWith({ sn: 1, chapter: 1, verses: { from: 2, to: 3 } })
    expect(view.isOpen()).toBe(false)
  })

  it('三途径关闭：点遮罩 / 点 ✕ / 选完', () => {
    // 1. 选完自动关
    const a = mount()
    a.view.openWithBook(1)
    click(a.view, 'chapter', '1')
    click(a.view, 'from', '1')
    click(a.view, 'to', '1')
    expect(a.view.isOpen()).toBe(false)
    // 2. 点遮罩
    const b = mount()
    b.view.openWithBook(1)
    b.root.querySelector<HTMLElement>('.cascade-mask')?.click()
    expect(b.view.isOpen()).toBe(false)
    // 3. 点 ✕
    const c = mount()
    c.view.openWithBook(1)
    c.root.querySelector<HTMLElement>('.cascade-close')?.click()
    expect(c.view.isOpen()).toBe(false)
  })

  it('不跨章（结构级）：中途换书/换章即清空起止，章列只呈现单卷章号', () => {
    const { view, onSelect } = mount()
    view.openWithBook(1)
    click(view, 'chapter', '2')
    click(view, 'from', '1')
    // 换书：起止与章全部清空
    click(view, 'book', '出埃及记')
    const dlg = document.querySelector<HTMLElement>('.cascade-dialog')!
    expect(dlg.querySelector('.cascade-chapter.selected')).toBeNull()
    expect([...dlg.querySelectorAll('.cascade-verse[data-kind="from"]')]).toHaveLength(0)
    expect(view.getSelection()).toBeNull()
    // 再选完仍是单章结构
    click(view, 'chapter', '1')
    click(view, 'from', '1')
    click(view, 'to', '2')
    const sel = onSelect.mock.calls[0]?.[0] as Selection
    expect(sel.chapter).toBe(1)
    expect(sel.verses.from).toBeLessThanOrEqual(sel.verses.to)
  })

  it('浮层形态：遮罩+弹窗为 fixed 定位（覆盖搜索/预览区，不占固定布局）', () => {
    const { root, view } = mount()
    view.open(null)
    const overlay = root.querySelector<HTMLElement>('.cascade-overlay')
    expect(overlay?.classList.contains('cascade-overlay')).toBe(true)
    // 源文件含 .cascade-overlay fixed 定位样式（不挤占 #layout 网格）
    const html = readFileSync('src/control/index.html', 'utf-8')
    expect(html).toMatch(/\.cascade-overlay\s*{\s*position:\s*fixed/)
    expect(html).toMatch(/id="cascade-root"/)
  })

  it('getSelection：未完成四列时为 null', () => {
    const { view } = mount()
    view.openWithBook(1)
    expect(view.getSelection()).toBeNull()
    click(view, 'chapter', '1')
    expect(view.getSelection()).toBeNull()
    click(view, 'from', '1')
    expect(view.getSelection()).toBeNull()
  })

  it('结束列点击先于起始节：忽略（无回调、不关窗）', () => {
    const { view, onSelect } = mount()
    view.openWithBook(1)
    click(view, 'chapter', '1')
    const dlg = document.querySelector<HTMLElement>('.cascade-dialog')!
    const toButtons = dlg.querySelectorAll('.cascade-verse[data-kind="to"]')
    expect(toButtons.length).toBe(0)
    expect(view.isOpen()).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Shift 连选旧交互不存在：verses-view.ts 已删除、章视图已删除（级联取而代之）', () => {
    expect(existsSync('src/control/verses-view.ts')).toBe(false)
    expect(existsSync('src/control/chapters-view.ts')).toBe(false)
  })
})

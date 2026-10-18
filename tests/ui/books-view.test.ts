// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BooksView } from '../../src/control/books-view'
import { CATEGORY_COLORS } from '../../src/shared/themes'
import { BOOKS } from '../../src/shared/bible'

// T3-grid 组件层测试：书卷网格 + 旧/新约 Tab（§5.2 / §6.2）

function mount(): { root: HTMLElement; view: BooksView; onBook: ReturnType<typeof vi.fn> } {
  const onBook = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new BooksView(root, { onBook })
  return { root, view, onBook }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('T3-grid 书卷网格（真实 66 卷数据）', () => {
  it('旧约 Tab 渲染 39 个书卷按钮，新约 27 个', () => {
    const { root, view } = mount()
    view.setTestament(0)
    expect(root.querySelectorAll('.book-btn')).toHaveLength(39)
    view.setTestament(1)
    expect(root.querySelectorAll('.book-btn')).toHaveLength(27)
  })

  it('每卷一行：全名为主（首卷「创世记」），简称为次（「创」），title 为全名（R3/R6）', () => {
    const { root, view } = mount()
    view.setTestament(0)
    const first = root.querySelector<HTMLElement>('.book-btn')
    expect(first?.querySelector('.book-name')?.textContent).toBe('创世记')
    expect(first?.querySelector('.book-short')?.textContent).toBe('创')
    expect(first?.title).toBe('创世记')
  })

  it('列表容器为纵向单列（.book-list），每行一个书卷按钮（R6 无横滚）', () => {
    const { root, view } = mount()
    view.setTestament(0)
    expect(root.querySelector('.book-list')).toBeTruthy()
    expect(root.querySelector('.book-grid')).toBeNull()
  })

  it('Tab 切换后网格内容变化：旧约含创世记/不含马可福音，新约反之', () => {
    const { root, view } = mount()
    view.setTestament(0)
    const names = () => [...root.querySelectorAll<HTMLElement>('.book-btn')].map((b) => b.title)
    expect(names()).toContain('创世记')
    expect(names()).not.toContain('马可福音')
    view.setTestament(1)
    expect(names()).toContain('马可福音')
    expect(names()).not.toContain('创世记')
  })

  it('Tab 按钮与激活态：旧约/新约/历史三个 tab，当前 tab 带 active 类', () => {
    const { root, view } = mount()
    view.setTestament(1)
    const tabs = [...root.querySelectorAll<HTMLElement>('.tab-btn')]
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['旧约', '新约', '历史'])
    const oldTab = tabs[0]!
    const newTab = tabs[1]!
    expect(newTab.classList.contains('active')).toBe(true)
    expect(oldTab.classList.contains('active')).toBe(false)
    oldTab.click()
    expect(oldTab.classList.contains('active')).toBe(true)
    expect(root.querySelectorAll('.book-btn')).toHaveLength(39)
  })

  it('第三 Tab「历史」：点击进入历史模式（onModeChange(history)、网格隐藏），点回旧约恢复书卷模式', () => {
    const onModeChange = vi.fn()
    const root = document.createElement('div')
    document.body.appendChild(root)
    new BooksView(root, { onBook: () => {}, onModeChange })
    const tabs = [...root.querySelectorAll<HTMLElement>('.tab-btn')]
    tabs[2]!.click()
    expect(onModeChange).toHaveBeenLastCalledWith('history')
    expect(root.querySelector<HTMLElement>('.book-list')!.hidden).toBe(true)
    tabs[0]!.click()
    expect(onModeChange).toHaveBeenLastCalledWith('books')
    expect(root.querySelector<HTMLElement>('.book-list')!.hidden).toBe(false)
    expect(root.querySelectorAll('.book-btn')).toHaveLength(39)
  })

  it('分类色 token 来自 themes.ts：每个按钮底色等于其 KindSN 分类的 token 值', () => {
    const { root, view } = mount()
    for (const t of [0, 1] as const) {
      view.setTestament(t)
      for (const btn of [...root.querySelectorAll<HTMLElement>('.book-btn')]) {
        const book = BOOKS.find((b) => b.name === btn.title)
        expect(book, `title=${btn.title} 应存在于书卷表`).toBeDefined()
        expect(btn.style.backgroundColor, `${book?.name} cat=${book?.cat}`).toBe(
          CATEGORY_COLORS[book!.cat]!.background,
        )
      }
    }
  })

  it('点击书卷按钮回调 onBook(sn)', () => {
    const { root, view, onBook } = mount()
    view.setTestament(0)
    const mark = [...root.querySelectorAll<HTMLElement>('.book-btn')].find((b) => b.title === '出埃及记')
    mark?.click()
    expect(onBook).toHaveBeenCalledWith(2)
  })
})

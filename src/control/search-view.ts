import { matchBooks } from '../shared/search'
import { BOOKS } from '../shared/bible'

// T3-search：卷名搜索下拉（§6.1 搜索框输入即过滤；§3.1.2 三路排序在 matchBooks 纯函数）。
// 选中结果回调 onBook(sn)，等效点击书卷网格按钮。

export interface SearchViewOptions {
  onBook(sn: number): void
}

// R6：命中前缀高亮——把 query 在文本中首次（不区分大小写）出现处包进 <mark>。
// 前缀（index 0）优先；此处用 indexOf 兼顾拼音多段与简称中的命中。
export function appendHighlighted(container: HTMLElement, text: string, query: string): void {
  const q = query.trim()
  const at = q === '' ? -1 : text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) {
    container.textContent = text
    return
  }
  container.append(
    document.createTextNode(text.slice(0, at)),
    Object.assign(document.createElement('mark'), { className: 'search-hl', textContent: text.slice(at, at + q.length) }),
    document.createTextNode(text.slice(at + q.length)),
  )
}

export class SearchView {
  private readonly input: HTMLInputElement
  private readonly dropdown: HTMLElement
  private readonly options: SearchViewOptions

  constructor(root: HTMLElement, options: SearchViewOptions) {
    this.options = options
    const box = document.createElement('div')
    box.className = 'search-box'
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'search-input'
    input.placeholder = '搜索书卷（拼音首字母 / 简称 / 全名）'
    input.setAttribute('aria-label', '卷名搜索')
    this.input = input
    const dropdown = document.createElement('ul')
    dropdown.className = 'search-dropdown'
    dropdown.hidden = true
    this.dropdown = dropdown
    input.addEventListener('input', () => this.setQuery(input.value))
    box.append(input, dropdown)
    root.replaceChildren(box)
  }

  setQuery(query: string): void {
    if (this.input.value !== query) this.input.value = query
    const hits = matchBooks(query, BOOKS as never[])
    this.dropdown.replaceChildren()
    for (const book of hits) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'search-item'
      btn.dataset.sn = String(book.sn)
      btn.dataset.name = book.name
      const name = document.createElement('span')
      name.className = 'search-item-name'
      appendHighlighted(name, book.name, query)
      const meta = document.createElement('span')
      meta.className = 'search-item-meta'
      appendHighlighted(meta, book.py.join(' / '), query)
      btn.append(name, meta)
      btn.addEventListener('click', () => {
        this.options.onBook(book.sn)
        this.clear()
      })
      li.appendChild(btn)
      this.dropdown.appendChild(li)
    }
    this.dropdown.hidden = hits.length === 0
  }

  clear(): void {
    this.input.value = ''
    this.dropdown.replaceChildren()
    this.dropdown.hidden = true
  }

  focus(): void {
    this.input.focus()
  }
}

import { bookBySn } from '../shared/bible'

// T3-grid：章列表视图（点击书卷后中栏出现，§6.1 第一、二击之间）。

export interface ChaptersViewOptions {
  onChapter(chapter: number): void
}

export class ChaptersView {
  private readonly title: HTMLElement
  private readonly list: HTMLElement
  private readonly options: ChaptersViewOptions
  private sn: number | null = null

  constructor(root: HTMLElement, options: ChaptersViewOptions) {
    this.options = options
    const title = document.createElement('h2')
    title.className = 'chapters-title'
    this.title = title
    const list = document.createElement('div')
    list.className = 'chapter-list'
    this.list = list
    root.replaceChildren(title, list)
    root.hidden = true
  }

  setBook(sn: number): void {
    this.sn = sn
    this.render()
  }

  getBook(): number | null {
    return this.sn
  }

  private render(): void {
    const root = this.title.parentElement
    if (root) root.hidden = false
    const book = this.sn === null ? undefined : bookBySn(this.sn)
    if (!book) return
    this.title.textContent = book.name
    this.list.replaceChildren()
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'chapter-btn'
      btn.textContent = String(chapter)
      btn.addEventListener('click', () => this.options.onChapter(chapter))
      this.list.appendChild(btn)
    }
  }
}

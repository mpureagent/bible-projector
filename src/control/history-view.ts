import { bookBySn } from '../shared/bible'
import type { HistoryEntry, Selection } from '../shared/types'

// T3-history / T7-cascade（R2）：历史列表视图（Tab 第三项，点击条目一键回填选区上屏）。
// 摘要为范围式「创世记 1:1-3 · 10:15」；数据由控制窗经 bridge.getHistory() 拉取后
// render；时间格式化可注入便于测试。

export interface HistoryViewOptions {
  onSelect(selection: Selection): void
  formatTime?(at: number): string
}

// R2 范围式摘要的时间段：仅 时:分（当天可辨、短小不换行）
const defaultFormatTime = (at: number): string => {
  const d = new Date(at)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export class HistoryView {
  private readonly options: Required<HistoryViewOptions>
  private readonly list: HTMLElement

  constructor(root: HTMLElement, options: HistoryViewOptions) {
    this.options = { formatTime: defaultFormatTime, ...options }
    const title = document.createElement('h2')
    title.className = 'history-title'
    title.textContent = '历史（最近 50 条）'
    const list = document.createElement('ul')
    list.className = 'history-list'
    this.list = list
    root.replaceChildren(title, list)
    root.hidden = true
  }

  setVisible(visible: boolean): void {
    const root = this.list.parentElement
    if (root) root.hidden = !visible
  }

  render(entries: readonly HistoryEntry[]): void {
    this.list.replaceChildren()
    if (entries.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'history-empty'
      empty.textContent = '暂无历史'
      this.list.appendChild(empty)
      return
    }
    for (const entry of entries) {
      const book = bookBySn(entry.selection.sn)
      const range =
        entry.selection.verses.from === entry.selection.verses.to
          ? `${entry.selection.verses.from}`
          : `${entry.selection.verses.from}-${entry.selection.verses.to}`
      const item = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'history-item'
      const label = document.createElement('span')
      label.className = 'history-item-label'
      label.textContent = `${book?.name ?? `卷 ${entry.selection.sn}`} ${entry.selection.chapter}:${range}`
      const time = document.createElement('span')
      time.className = 'history-item-time'
      time.textContent = ` · ${this.options.formatTime(entry.at)}`
      btn.append(label, time)
      btn.addEventListener('click', () => this.options.onSelect(entry.selection))
      item.appendChild(btn)
      this.list.appendChild(item)
    }
  }
}

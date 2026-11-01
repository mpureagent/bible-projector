import type { Selection } from '../shared/types'

// W2：控制窗窄屏单栏两态（list/detail）。
// 断点 900px；窄屏用 hidden 属性切换左右栏与返回按钮，元素始终留在 DOM。
// 只有**换选区**才自动进 detail：初始 hydration 与主题/投屏等状态刷新不改变当前视图。

export const NARROW_BREAKPOINT = 900
export const NARROW_MEDIA_QUERY = `(max-width: ${NARROW_BREAKPOINT}px)`
export type NarrowView = 'list' | 'detail'

export interface LayoutMediaQuery {
  matches: boolean
  addEventListener?(type: 'change', listener: (event: MediaQueryListEvent) => void): void
  removeEventListener?(type: 'change', listener: (event: MediaQueryListEvent) => void): void
}

export interface ControlLayoutElements {
  body: HTMLElement
  left: HTMLElement
  right: HTMLElement
  back: HTMLElement
}

export interface LayoutState {
  selection: Selection | null
}

export function selectionKey(selection: Selection | null): string | null {
  if (!selection) return null
  return `${selection.sn}:${selection.chapter}:${selection.verses.from}-${selection.verses.to}`
}

export class ControlLayout {
  private narrow: boolean
  private view: NarrowView = 'list'
  private hasState = false
  private lastSelection: string | null = null

  constructor(
    private readonly elements: ControlLayoutElements,
    private readonly media?: LayoutMediaQuery,
  ) {
    this.narrow = media?.matches ?? false
    this.apply()
    media?.addEventListener?.('change', this.onMediaChange)
  }

  isNarrow(): boolean {
    return this.narrow
  }

  getView(): NarrowView {
    return this.view
  }

  setView(view: NarrowView): void {
    this.view = view
    this.apply()
  }

  showDetail(): void {
    this.setView('detail')
  }

  backToList(): void {
    this.setView('list')
  }

  handleState(state: LayoutState): void {
    const key = selectionKey(state.selection)
    const changed = this.hasState && key !== this.lastSelection
    this.hasState = true
    this.lastSelection = key
    if (this.narrow && changed && key !== null) this.view = 'detail'
    this.apply()
  }

  dispose(): void {
    this.media?.removeEventListener?.('change', this.onMediaChange)
  }

  private readonly onMediaChange = (event: MediaQueryListEvent): void => {
    const wasNarrow = this.narrow
    this.narrow = event.matches
    // 桌面缩到窄屏：已有选区时直接看预览，否则留在列表
    if (this.narrow && !wasNarrow) this.view = this.lastSelection === null ? 'list' : 'detail'
    this.apply()
  }

  private apply(): void {
    const { body, left, right, back } = this.elements
    body.classList.toggle('narrow', this.narrow)
    if (this.narrow) body.dataset.narrowView = this.view
    else delete body.dataset.narrowView
    left.hidden = this.narrow && this.view === 'detail'
    right.hidden = this.narrow && this.view === 'list'
    back.hidden = !(this.narrow && this.view === 'detail')
  }
}
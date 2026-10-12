import type { Action, AppState, HistoryEntry, ProjectionStyle, Selection } from '../shared/types'

export interface PersistedConfig {
  style: ProjectionStyle
  display: number | null
}

export interface Persistence {
  loadConfig(): { style?: Partial<ProjectionStyle>; display?: number | null }
  saveConfig(config: PersistedConfig): void
  loadHistory(): HistoryEntry[]
  saveHistory(history: HistoryEntry[]): void
}

const DEFAULT_STYLE: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  mode: 'paragraph',
  hideVerseNumbers: false,
  hideTitle: false,
}
const HISTORY_CAP = 50
const FONT_SIZE_MAX = 200 // §11：字号上限

export class AppStateStore {
  private state: AppState
  private history: HistoryEntry[]
  private readonly listeners = new Set<(state: AppState) => void>()

  constructor(private readonly persistence: Persistence) {
    const config = persistence.loadConfig()
    this.state = {
      selection: null,
      style: { ...DEFAULT_STYLE, ...config.style },
      blank: false,
      lock: false,
      display: config.display ?? null,
    }
    this.history = persistence.loadHistory()
  }

  getState(): Readonly<AppState> {
    return this.state
  }

  getHistory(): readonly HistoryEntry[] {
    return this.history
  }

  dispatch(action: Action): Readonly<AppState> {
    this.state = reduce(this.state, action)
    if (action.type === 'select' && action.selection) {
      this.pushHistory(action.selection)
    }
    if (action.type === 'style' || action.type === 'display') {
      this.persistence.saveConfig({ style: this.state.style, display: this.state.display })
    }
    for (const listener of this.listeners) listener(this.state)
    return this.state
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private pushHistory(selection: Selection): void {
    const last = this.history[0]
    const sameAsLast =
      last !== undefined &&
      last.selection.sn === selection.sn &&
      last.selection.chapter === selection.chapter &&
      last.selection.verses.from === selection.verses.from &&
      last.selection.verses.to === selection.verses.to
    if (sameAsLast) {
      // 同书同范围连续选择合并为最新：刷新时间戳，不新增条目
      this.history[0] = { selection, at: Date.now() }
    } else {
      this.history.unshift({ selection, at: Date.now() })
      if (this.history.length > HISTORY_CAP) this.history.length = HISTORY_CAP
    }
    this.persistence.saveHistory(this.history)
  }
}

function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'select':
      return { ...state, selection: action.selection }
    case 'style': {
      const patch = action.patch.fontSize
        ? { ...action.patch, fontSize: Math.min(FONT_SIZE_MAX, Math.max(8, action.patch.fontSize)) }
        : action.patch
      return { ...state, style: { ...state.style, ...patch } }
    }
    case 'blank':
      return { ...state, blank: action.value }
    case 'lock':
      return { ...state, lock: action.value }
    case 'display':
      return { ...state, display: action.id }
  }
}

// 共享类型与 IPC 通道契约（§3.2 / §5.3 关联）。
// AppState = { selection, style, blank, lock, display }——main 为状态唯一持有者。

export type ThemeName = 'ink' | 'ivory' | 'ocean'

export type LayoutMode = 'paragraph' | 'single'

export interface ProjectionStyle {
  theme: ThemeName
  fontSize: number
  mode: LayoutMode
  hideVerseNumbers: boolean
  hideTitle: boolean
}

export interface VerseRange {
  from: number
  to: number
}

export interface Selection {
  sn: number
  chapter: number
  verses: VerseRange
}

export interface AppState {
  selection: Selection | null
  style: ProjectionStyle
  blank: boolean
  lock: boolean
  display: number | null
}

export type Action =
  | { type: 'select'; selection: Selection | null }
  | { type: 'style'; patch: Partial<ProjectionStyle> }
  | { type: 'blank'; value: boolean }
  | { type: 'lock'; value: boolean }
  | { type: 'display'; id: number }

export interface HistoryEntry {
  selection: Selection
  at: number
}

export const IPC_CHANNELS = {
  action: 'app:action',
  getState: 'app:get-state',
  getHistory: 'app:get-history',
  state: 'app:state',
  banner: 'app:banner',
} as const

const ACTION_TYPES = new Set(['select', 'style', 'blank', 'lock', 'display'])

export function isAction(value: unknown): value is Action {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && ACTION_TYPES.has(type)
}

export interface BridgeApi {
  dispatch(action: Action): Promise<AppState>
  getState(): Promise<AppState>
  getHistory(): Promise<HistoryEntry[]>
  onState(callback: (state: AppState) => void): () => void
  onBanner(callback: (banner: { text: string | null }) => void): () => void
}

declare global {
  interface Window {
    bridge: BridgeApi
  }
}

// 共享类型与 IPC 通道契约（§3.2 / §5.3 关联）。
// AppState = { selection, style, blank, lock, display }——main 为状态唯一持有者。

import type { Align, FontChoice } from './style'

export type ThemeName = 'ink' | 'ivory' | 'ocean'

export type LayoutMode = 'paragraph' | 'single'

// §2.3 样式全项：色值/背景图 null = 跟随当前主题 token；backgroundImage 为
// 'builtin:<纹理id>'（随包）或本地绝对路径（网络 URL 在 store 层被清洗）
export interface ProjectionStyle {
  theme: ThemeName
  fontSize: number
  mode: LayoutMode
  hideVerseNumbers: boolean
  hideTitle: boolean
  fontFamily: FontChoice
  color: string | null
  verseNumberColor: string | null
  currentColor: string | null
  background: string | null
  backgroundImage: string | null
  lineHeight: number
  letterSpacing: number
  align: Align
  margin: number
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
  getDisplays: 'app:get-displays',
  projectionFullscreen: 'app:projection-fullscreen',
  state: 'app:state',
  banner: 'app:banner',
} as const

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
}

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
  getDisplays(): Promise<DisplayInfo[]>
  setProjectionFullscreen(value?: boolean): Promise<void>
  onState(callback: (state: AppState) => void): () => void
  onBanner(callback: (banner: { text: string | null }) => void): () => void
}

declare global {
  interface Window {
    bridge: BridgeApi
  }
}

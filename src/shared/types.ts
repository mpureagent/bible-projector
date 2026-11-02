// 共享类型与 IPC 通道契约（§3.2 / §5.3 关联）。
// AppState = { selection, style, display }——main 为状态唯一持有者。
// T7-projection（R1）：全屏遮挡/锁定类会话态整体移除；projecting 为唯一会话态。

import type { Align, BackgroundMode, FontChoice } from './style'

// R5：8 套预设主题
export type ThemeName =
  | 'ink'
  | 'ivory'
  | 'ocean'
  | 'parchment'
  | 'forest'
  | 'charcoal'
  | 'contrast'
  | 'wine'

// §2.3 样式全项：色值/背景图 null = 跟随当前主题 token；backgroundImage 为
// 'builtin:<纹理id>'（随包）或本地绝对路径（网络 URL 在 store 层被清洗）
// T7-flow（R2/R4）：单节模式 mode 废除——排版定死自然段落流一种。
export interface ProjectionStyle {
  theme: ThemeName
  fontSize: number
  hideVerseNumbers: boolean
  hideTitle: boolean
  fontFamily: FontChoice
  color: string | null
  verseNumberColor: string | null
  currentColor: string | null
  background: string | null
  backgroundImage: string | null
  // R8c：背景三选一（theme 随主题 token / texture 内置纹理 / image 本地图片 / color 纯色），互斥
  backgroundMode: BackgroundMode
  lineHeight: number
  letterSpacing: number
  align: Align
  margin: number
  // W3：true = 整段不点亮任何节（展示模式）。缺省按 false 处理
  hideCurrent?: boolean
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
  display: number | null
  // T6/T7：投屏中。false=本地阅读模式（选经只更新控制窗，不广播投影窗）
  projecting: boolean
  // W3：当前点亮节；与 selection（渲染范围）解耦。缺省（旧状态快照）= 按 selection.from 处理
  currentVerse?: number | null
}

export type Action =
  | { type: 'select'; selection: Selection | null }
  | { type: 'style'; patch: Partial<ProjectionStyle> }
  | { type: 'display'; id: number }
  | { type: 'projecting'; value: boolean }

// W3：当前节点亮动作。单独成类而非并入 Action：滚动时高频派发，
// 且 Action 的既有消费方（历史/持久化）只关心选区与样式。
export type HighlightAction = { type: 'highlight'; verse: number | null }

// 状态中枢/桥接的完整动作契约
export type AppAction = Action | HighlightAction

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
  // T7-flow（R4）：滚动副通道——控制窗 PgUp/PgDn 令投影窗纵向滚动一屏（瞬态，不入状态）
  scroll: 'app:scroll',
} as const

export type ScrollDirection = 'up' | 'down'

const ACTION_TYPES = new Set(['select', 'style', 'display', 'projecting', 'highlight'])

export function isAction(value: unknown): value is AppAction {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && ACTION_TYPES.has(type)
}

export interface BridgeApi {
  dispatch(action: AppAction): Promise<AppState>
  getState(): Promise<AppState>
  getHistory(): Promise<HistoryEntry[]>
  onState(callback: (state: AppState) => void): () => void
  onBanner(callback: (banner: { text: string | null }) => void): () => void
  // T7-flow（R4）：滚动副通道（控制窗 → 投影窗）
  sendScroll(direction: ScrollDirection): void
  onScroll(callback: (direction: ScrollDirection) => void): () => void
}

declare global {
  interface Window {
    bridge: BridgeApi
  }
}

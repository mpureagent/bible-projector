import type { Action, AppState, HistoryEntry, ProjectionStyle, Selection } from '../shared/types'
import { isBuiltinTexture, validateBackgroundImage, validateColor } from '../shared/style'

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
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  backgroundMode: 'theme',
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}
const HISTORY_CAP = 50
const FONT_SIZE_MAX = 200 // §11：字号上限
const FONT_SIZE_MIN = 8
const MARGIN_MIN = 8 // §11：边距 ≥8% 安全区
const MARGIN_MAX = 30
const LINE_HEIGHT_RANGE: [number, number] = [1, 3]
const LETTER_SPACING_RANGE: [number, number] = [0, 0.5]
const COLOR_FIELDS = ['color', 'verseNumberColor', 'currentColor', 'background'] as const

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

// §2.3/R8c 补丁入站清洗：非法背景图/色值丢弃，数值限幅；背景 mode 缺省时按值推导
function sanitizePatch(patch: Partial<ProjectionStyle>): Partial<ProjectionStyle> {
  const next: Partial<ProjectionStyle> = { ...patch }
  if (next.fontSize !== undefined) next.fontSize = clamp(next.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX)
  if (next.margin !== undefined) next.margin = clamp(next.margin, MARGIN_MIN, MARGIN_MAX)
  if (next.lineHeight !== undefined) next.lineHeight = clamp(next.lineHeight, ...LINE_HEIGHT_RANGE)
  if (next.letterSpacing !== undefined) next.letterSpacing = clamp(next.letterSpacing, ...LETTER_SPACING_RANGE)
  for (const field of COLOR_FIELDS) {
    const value = next[field]
    if (value !== undefined && value !== null && !validateColor(value)) next[field] = null
  }
  if (next.backgroundImage !== undefined && validateBackgroundImage(next.backgroundImage) !== null) {
    next.backgroundImage = null
  }
  // 背景 mode 推导：值变了但调用方未显式给 mode 时，按值判定（纹理/图片/纯色/主题）
  if (next.backgroundMode === undefined) {
    if (next.backgroundImage !== undefined) {
      next.backgroundMode = isBuiltinTexture(next.backgroundImage) ? 'texture' : next.backgroundImage ? 'image' : 'theme'
    } else if (next.background !== undefined) {
      next.backgroundMode = validateColor(next.background) ? 'color' : 'theme'
    }
  }
  return next
}

// R8c：背景三选一互斥——按 mode 清空对侧字段；值非法则回落主题
function enforceBackground(style: ProjectionStyle): ProjectionStyle {
  const s = { ...style }
  switch (s.backgroundMode) {
    case 'theme':
      s.background = null
      s.backgroundImage = null
      break
    case 'texture':
      s.background = null
      if (!isBuiltinTexture(s.backgroundImage)) {
        s.backgroundMode = 'theme'
        s.backgroundImage = null
      }
      break
    case 'image':
      s.background = null
      if (!s.backgroundImage || isBuiltinTexture(s.backgroundImage)) {
        s.backgroundMode = 'theme'
        s.backgroundImage = null
      }
      break
    case 'color':
      s.backgroundImage = null
      if (!validateColor(s.background)) {
        s.backgroundMode = 'theme'
        s.background = null
      }
      break
  }
  return s
}

// 合并默认样式并解析背景三选一；config 缺 backgroundMode（v0.9.0 旧配置）时按既有值推导（R8c 迁移）
function resolveStyle(configStyle?: Partial<ProjectionStyle>): ProjectionStyle {
  const merged: ProjectionStyle = { ...DEFAULT_STYLE, ...configStyle }
  if (configStyle && 'backgroundMode' in configStyle) return enforceBackground(merged)
  const mode = isBuiltinTexture(merged.backgroundImage)
    ? 'texture'
    : merged.backgroundImage
      ? 'image'
      : validateColor(merged.background)
        ? 'color'
        : 'theme'
  return enforceBackground({ ...merged, backgroundMode: mode })
}

export class AppStateStore {
  private state: AppState
  private history: HistoryEntry[]
  private readonly listeners = new Set<(state: AppState) => void>()

  constructor(private readonly persistence: Persistence) {
    const config = persistence.loadConfig()
    this.state = {
      selection: null,
      style: resolveStyle(config.style),
      display: config.display ?? null,
      projecting: false,
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
    case 'style':
      return { ...state, style: enforceBackground({ ...state.style, ...sanitizePatch(action.patch) }) }
    case 'display':
      return { ...state, display: action.id }
    case 'projecting':
      return { ...state, projecting: action.value }
  }
}
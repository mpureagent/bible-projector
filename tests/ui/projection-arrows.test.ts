// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppAction, AppState, ProjectionStyle, Selection } from '../../src/shared/types'

// W3 P0 回归：投影窗 ↑↓ 只发 highlight，绝不改 selection（不再把 16-21 压成 18-18）。

const baseStyle: ProjectionStyle = {
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

const range: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 21 } }

function baseState(currentVerse = 16): AppState {
  return { selection: range, style: { ...baseStyle }, display: null, projecting: true, currentVerse }
}

function apply(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'select':
      return {
        ...state,
        selection: action.selection,
        currentVerse: action.selection ? action.selection.verses.from : null,
      }
    case 'highlight':
      return { ...state, currentVerse: action.verse }
    case 'style':
      return { ...state, style: { ...state.style, ...action.patch } }
    case 'display':
      return { ...state, display: action.id }
    case 'projecting':
      return { ...state, projecting: action.value }
  }
}

const listeners = new Set<(state: AppState) => void>()
let state: AppState = baseState()
let dispatch: Mock<(action: AppAction) => Promise<AppState>>

const press = (key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

const seed = (currentVerse: number): void => {
  state = baseState(currentVerse)
  for (const listener of listeners) listener(state)
  dispatch.mockClear()
}

beforeAll(async () => {
  document.body.innerHTML = '<div id="stage"></div><div id="scrollbar"></div>'
  dispatch = vi.fn((action: AppAction) => {
    state = apply(state, action)
    for (const listener of listeners) listener(state)
    return Promise.resolve(state)
  })
  ;(window as unknown as { bridge: unknown }).bridge = {
    dispatch,
    getState: () => Promise.resolve(state),
    getHistory: () => Promise.resolve([]),
    onState: (callback: (next: AppState) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onBanner: () => () => {},
    onScroll: () => () => {},
    sendScroll: () => {},
  }
  await import('../../src/projection/main')
  await Promise.resolve()
  await Promise.resolve()
})

beforeEach(() => {
  seed(16)
})

describe('W3 P0：投影窗 ↓ 不再压缩选区', () => {
  it('3:16-21 连按 ↓ 5 次：selection 始终 16-21、投影始终 6 节', () => {
    const stage = document.getElementById('stage')!
    for (let i = 0; i < 5; i++) {
      press('ArrowDown')
      const selected = state.selection
        ? `${state.selection.chapter}:${state.selection.verses.from}-${state.selection.verses.to}`
        : 'null'
      const nodes = stage.querySelectorAll<HTMLElement>('.flow > .vtext').length
      console.log(`[W3] ↓#${i + 1} selection=${selected} currentVerse=${state.currentVerse} projectionVerses=${nodes}`)
    }

    const actions = dispatch.mock.calls.map(([action]) => action)
    expect(actions.map((action) => action.type)).toEqual([
      'highlight',
      'highlight',
      'highlight',
      'highlight',
      'highlight',
    ])
    expect(actions.map((action) => (action.type === 'highlight' ? action.verse : null))).toEqual([17, 18, 19, 20, 21])
    expect(actions.some((action) => action.type === 'select')).toBe(false)

    expect(state.selection).toEqual(range)
    expect(stage.querySelectorAll<HTMLElement>('.flow > .vtext')).toHaveLength(6)
    expect(stage.querySelector<HTMLElement>('.vtext.current')?.dataset.verse).toBe('21')
  })

  it('到选区末节后 ↓ 无动作（不越界、不改选区）', () => {
    seed(21)
    press('ArrowDown')
    expect(dispatch).not.toHaveBeenCalled()
    expect(state.selection).toEqual(range)
  })

  it('到选区首节后 ↑ 无动作（不越界、不改选区）', () => {
    seed(16)
    press('ArrowUp')
    expect(dispatch).not.toHaveBeenCalled()
    expect(state.selection).toEqual(range)
  })

  it('↑ 只把 currentVerse 从 18 移到 17，selection 不变', () => {
    seed(18)
    press('ArrowUp')
    expect(dispatch).toHaveBeenCalledWith({ type: 'highlight', verse: 17 })
    expect(state.selection).toEqual(range)
    expect(state.currentVerse).toBe(17)
  })
})
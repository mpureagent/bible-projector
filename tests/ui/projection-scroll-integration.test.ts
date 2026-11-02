// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppAction, AppState, ProjectionStyle, Selection } from '../../src/shared/types'
import { VERSE_ATTR } from '../../src/shared/passage'

// W3 端到端（happy-dom + 模拟布局）：投影窗滚动取节 / 点击取节 / 不扰动滚动位置。

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
const VERSE_HEIGHT = 80
const verseTop = (verse: number): number => (verse - 16) * 120

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
const stage = (): HTMLElement => document.getElementById('stage')!

function applyLayout(): void {
  const el = stage()
  Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0 }),
    configurable: true,
  })
  for (const node of el.querySelectorAll<HTMLElement>(`[${VERSE_ATTR}]`)) {
    const verse = Number(node.getAttribute(VERSE_ATTR))
    Object.defineProperty(node, 'offsetTop', { get: () => verseTop(verse), configurable: true })
    Object.defineProperty(node, 'offsetHeight', { get: () => VERSE_HEIGHT, configurable: true })
    Object.defineProperty(node, 'getBoundingClientRect', {
      value: () => {
        const top = verseTop(verse) - el.scrollTop
        return { top, bottom: top + VERSE_HEIGHT, left: 0, right: 400, width: 400, height: VERSE_HEIGHT, x: 0, y: top }
      },
      configurable: true,
    })
  }
}

const seed = (currentVerse: number): void => {
  stage().scrollTop = 0
  state = baseState(currentVerse)
  for (const listener of listeners) listener(state)
  applyLayout()
  dispatch.mockClear()
}

const scrollTo = (top: number): void => {
  stage().scrollTop = top
  applyLayout()
  stage().dispatchEvent(new Event('scroll'))
}

const waitSettle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 350))

beforeAll(async () => {
  document.body.innerHTML = '<div id="stage"></div><div id="scrollbar"></div>'
  dispatch = vi.fn((action: AppAction) => {
    state = apply(state, action)
    for (const listener of listeners) listener(state)
    if (action.type === 'select' || action.type === 'style') applyLayout()
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

beforeEach(async () => {
  seed(16)
  // 排空上一用例可能遗留的结算定时器，避免串扰
  await new Promise((resolve) => setTimeout(resolve, 350))
  dispatch.mockClear()
})

describe('W3 投影窗滚动取节（屏幕顶部第一行）', () => {
  it('滚到中段停下：点亮顶部第一行所在的节，且不改选区、不顶走滚动位置', async () => {
    scrollTo(400)
    await waitSettle()

    const current = stage().querySelector<HTMLElement>('.vtext.current')!
    const verse = Number(current.getAttribute(VERSE_ATTR))
    const rect = current.getBoundingClientRect()
    console.log(
      `[W3] scrollTop=${stage().scrollTop} currentVerse=${verse} rect.top=${rect.top} rect.bottom=${rect.bottom}`,
    )

    expect(verse).toBe(19)
    expect(stage().scrollTop).toBe(400)
    expect(state.selection).toEqual(range)
    expect(dispatch).toHaveBeenCalledWith({ type: 'highlight', verse: 19 })
  })

  it('连续快速滚动：停下后只结算一次', async () => {
    let lastTop = 0
    let lastVerse = 16
    for (let top = 0; top <= 480; top += 80) {
      scrollTo(top)
      lastTop = top
      // 模拟用户持续滚动（每 80px 一次，约 2 秒内的采样密度远高于每帧）
      await new Promise((resolve) => setTimeout(resolve, 20))
      const current = stage().querySelector<HTMLElement>('.vtext.current')
      lastVerse = current ? Number(current.getAttribute(VERSE_ATTR)) : lastVerse
    }
    await waitSettle()
    console.log(
      `[W3] rapid scroll stops at scrollTop=${lastTop}, currentVerse=${state.currentVerse}, last=${lastVerse}, dispatch=${JSON.stringify(
        dispatch.mock.calls.map(([action]) => action),
      )}`,
    )
    expect(dispatch.mock.calls.filter(([action]) => action.type === 'highlight').length).toBeLessThanOrEqual(2)
    expect(state.currentVerse).toBe(20)
    expect(state.selection).toEqual(range)
  })
})

describe('W3 投影窗点击取节', () => {
  it('点击某节 → 该节点亮，selection 不变，scrollTop 不变', () => {
    scrollTo(400)
    const target = stage().querySelector<HTMLElement>(`[${VERSE_ATTR}="20"]`)!
    target.click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'highlight', verse: 20 })
    expect(state.currentVerse).toBe(20)
    expect(state.selection).toEqual(range)
    expect(stage().scrollTop).toBe(400)
    expect(stage().querySelector<HTMLElement>('.vtext.current')?.dataset.verse).toBe('20')
  })

  it('点击比视口更高的部分可见节也不滚动（点击来源不做出屏跟随）', () => {
    scrollTo(500)
    // 模拟长节：底边远超视口，若走 follow 会被底对齐拉走
    const tall = stage().querySelector<HTMLElement>(`[${VERSE_ATTR}="20"]`)!
    Object.defineProperty(tall, 'offsetHeight', { get: () => 1200, configurable: true })
    tall.click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'highlight', verse: 20 })
    expect(state.currentVerse).toBe(20)
    expect(stage().scrollTop).toBe(500)
  })
})
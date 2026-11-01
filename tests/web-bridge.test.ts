import { describe, expect, it, vi } from 'vitest'
import type { AppState, HistoryEntry } from '../src/shared/types'
import { createWebBridge, type EventSourceLike } from '../src/web/bridge-client'

// W1：浏览器桥接适配器——注入 fake fetch/EventSource，验证与 BridgeApi 等价。

type Listener = (event: MessageEvent) => void

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, payload: unknown): void {
    const event = { data: JSON.stringify(payload) } as MessageEvent
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

interface FetchCall {
  url: string
  init?: RequestInit
}

function fakeFetch(payload: unknown): { fetcher: (url: string, init?: RequestInit) => Promise<Response>; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => payload } as Response
  }
  return { fetcher, calls }
}

function makeBridge(payload: unknown = {}) {
  FakeEventSource.instances = []
  const { fetcher, calls } = fakeFetch(payload)
  const bridge = createWebBridge({
    fetch: fetcher,
    createEventSource: (url) => new FakeEventSource(url),
  })
  return { bridge, calls, source: FakeEventSource.instances[0]! }
}

const state: AppState = {
  selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } },
  style: {
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
  },
  display: null,
  projecting: true,
}

describe('W1 Web 桥接适配器', () => {
  it('dispatch 走 POST /api/action 并返回新状态', async () => {
    const { bridge, calls } = makeBridge(state)
    const result = await bridge.dispatch({ type: 'select', selection: state.selection })
    expect(result).toEqual(state)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/action')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      action: { type: 'select', selection: state.selection },
    })
  })

  it('getState / getHistory 走对应 GET', async () => {
    const history: HistoryEntry[] = [{ selection: state.selection!, at: 1 }]
    const { bridge, calls } = makeBridge(history)
    const entries = await bridge.getHistory()
    expect(entries).toEqual(history)
    expect(calls[0]?.url).toBe('/api/history')
    await bridge.getState()
    expect(calls[1]?.url).toBe('/api/state')
  })

  it('onState 收到 SSE state 事件后回调，取消订阅后不再回调', () => {
    const { bridge, source } = makeBridge()
    const seen: AppState[] = []
    const unsubscribe = bridge.onState((next) => seen.push(next))
    source.emit('state', state)
    expect(seen).toEqual([state])
    unsubscribe()
    source.emit('state', { ...state, projecting: false })
    expect(seen).toEqual([state])
  })

  it('onState/onBanner/onScroll 共用同一条 EventSource 连接', () => {
    const { bridge } = makeBridge()
    bridge.onState(() => {})
    bridge.onBanner(() => {})
    bridge.onScroll(() => {})
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]?.url).toBe('/api/events')
  })

  it('onBanner / onScroll 解析事件并支持退订', () => {
    const { bridge, source } = makeBridge()
    const banners: Array<{ text: string | null }> = []
    const scrolls: string[] = []
    const offBanner = bridge.onBanner((banner) => banners.push(banner))
    const offScroll = bridge.onScroll((direction) => scrolls.push(direction))
    source.emit('banner', { text: '提示' })
    source.emit('scroll', 'down')
    expect(banners).toEqual([{ text: '提示' }])
    expect(scrolls).toEqual(['down'])
    offBanner()
    offScroll()
    source.emit('banner', { text: null })
    source.emit('scroll', 'up')
    expect(banners).toHaveLength(1)
    expect(scrolls).toHaveLength(1)
  })

  it('sendScroll 走 POST /api/scroll', async () => {
    const { bridge, calls } = makeBridge()
    bridge.sendScroll('down')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.url).toBe('/api/scroll')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ direction: 'down' })
  })

  it('多个订阅者互不影响；重复退订安全', () => {
    const { bridge, source } = makeBridge()
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = bridge.onState(first)
    bridge.onState(second)
    source.emit('state', state)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    offFirst()
    offFirst()
    source.emit('state', { ...state, projecting: false })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('dispatch 非 2xx 抛错（不静默失败）', async () => {
    FakeEventSource.instances = []
    const bridge = createWebBridge({
      fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
      createEventSource: (url) => new FakeEventSource(url),
    })
    await expect(bridge.dispatch({ type: 'projecting', value: true })).rejects.toThrow(/500/)
  })
})
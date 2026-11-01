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

function makeBridge(payload: unknown = {}, extra: { sseStallMs?: number; pollIntervalMs?: number } = {}) {
  FakeEventSource.instances = []
  const { fetcher, calls } = fakeFetch(payload)
  const bridge = createWebBridge({
    fetch: fetcher,
    createEventSource: (url) => new FakeEventSource(url),
    // 默认给足时间，避免无关用例被看门狗干扰；降级用例显式覆盖
    sseStallMs: 60_000,
    ...extra,
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

// W2 修复：cloudflared 隧道会缓冲 SSE——连接建立、不报错，但事件永不到达。
// 若不降级，界面会「状态正确但永不刷新」，且无任何报错可循。
describe('W2 SSE 卡死时的轮询降级', () => {
  it('SSE 迟迟无事件 → 自动降级轮询并推送状态变化', async () => {
    vi.useFakeTimers()
    try {
      const { bridge, calls, source } = makeBridge(state, { sseStallMs: 100, pollIntervalMs: 50 })
      const spy = vi.fn()
      bridge.onState(spy)

      // 看门狗到期前不应有任何轮询请求
      expect(calls.filter((c) => c.url.endsWith('/api/state'))).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(120)
      // 降级后必须关掉 SSE，避免半死连接占着
      expect(source.closed).toBe(true)

      await vi.advanceTimersByTimeAsync(60)
      const stateCalls = calls.filter((c) => c.url.endsWith('/api/state'))
      expect(stateCalls.length).toBeGreaterThan(0)
      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0]![0]).toEqual(state)
    } finally {
      vi.useRealTimers()
    }
  })

  it('轮询模式下状态未变不重复回调（与 SSE 通道去重）', async () => {
    vi.useFakeTimers()
    try {
      const { bridge } = makeBridge(state, { sseStallMs: 10, pollIntervalMs: 20 })
      const spy = vi.fn()
      bridge.onState(spy)
      await vi.advanceTimersByTimeAsync(200)
      // fake fetch 永远返回同一 state，去重后只应回调一次
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('SSE 正常收到事件时不启动轮询', async () => {
    vi.useFakeTimers()
    try {
      const { bridge, calls, source } = makeBridge(state, { sseStallMs: 100, pollIntervalMs: 50 })
      bridge.onState(() => {})
      // 看门狗到期前来了事件
      source.emit('state', state)
      await vi.advanceTimersByTimeAsync(300)
      expect(source.closed).toBe(false)
      expect(calls.filter((c) => c.url.endsWith('/api/state'))).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
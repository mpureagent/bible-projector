import type { Action, AppState, BridgeApi, HistoryEntry, ScrollDirection } from '../shared/types'

// W1：浏览器版 window.bridge——HTTP 请求 + 单条 SSE 连接。
// onState/onBanner/onScroll 共用一个 EventSource；EventSource 自带断线重连，
// 监听器只注册一次，重连不会重复回调。
//
// W2 修复：某些中间层（实测 cloudflared 隧道）会缓冲 SSE 响应流——连接能建立、
// 不报错，但事件永远不到达。这种情况下界面会"状态正确但永不刷新"，且无任何报错可循。
// 因此加看门狗：SSE 建立后若迟迟收不到任何事件，自动降级为轮询 /api/state。

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void
  close(): void
}

export type EventSourceFactory = (url: string) => EventSourceLike

export interface WebBridgeOptions {
  fetch?: FetchLike
  createEventSource?: EventSourceFactory
  baseUrl?: string
  /** SSE 建立后多久收不到事件就判定不可用（默认 2500ms） */
  sseStallMs?: number
  /** 轮询间隔（默认 1000ms） */
  pollIntervalMs?: number
}

export function createWebBridge(options: WebBridgeOptions = {}): BridgeApi {
  const fetcher: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  const base = options.baseUrl ?? ''
  const sseStallMs = options.sseStallMs ?? 2500
  const pollIntervalMs = options.pollIntervalMs ?? 1000

  const stateListeners = new Set<(state: AppState) => void>()
  const bannerListeners = new Set<(banner: { text: string | null }) => void>()
  const scrollListeners = new Set<(direction: ScrollDirection) => void>()

  const source = (options.createEventSource ?? ((url) => new EventSource(url) as unknown as EventSourceLike))(
    `${base}/api/events`,
  )

  const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(`${base}${path}`, init)
    if (!response.ok) throw new Error(`请求 ${path} 失败：HTTP ${response.status}`)
    return (await response.json()) as T
  }

  // SSE 与轮询两条通道都可能送 state，用序列化去重，避免同一状态重复渲染
  let lastSerialized = ''
  const notifyState = (state: AppState): void => {
    const serialized = JSON.stringify(state)
    if (serialized === lastSerialized) return
    lastSerialized = serialized
    for (const listener of stateListeners) listener(state)
  }

  const parseOrUndefined = <T>(event: MessageEvent): T | undefined => {
    try {
      return JSON.parse(event.data) as T
    } catch {
      return undefined
    }
  }

  let polling = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let stallTimer: ReturnType<typeof setTimeout> | null = null

  const stopStallTimer = (): void => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer)
      stallTimer = null
    }
  }

  const startPolling = (): void => {
    if (polling) return
    polling = true
    stopStallTimer()
    try {
      source.close()
    } catch {
      // 已经关闭或从未真正连接，忽略
    }
    pollTimer = setInterval(() => {
      void requestJson<AppState>('/api/state')
        .then(notifyState)
        .catch(() => {
          // 网络抖动：本轮失败，下轮再试（不降级、不报错）
        })
    }, pollIntervalMs)
  }

  // SSE 有任何动静就撤掉看门狗，说明这条通道是通的
  const armStallTimer = (): void => {
    stopStallTimer()
    stallTimer = setTimeout(startPolling, sseStallMs)
  }

  source.addEventListener('state', (event) => {
    stopStallTimer()
    const state = parseOrUndefined<AppState>(event)
    if (state !== undefined) notifyState(state)
  })
  source.addEventListener('banner', (event) => {
    stopStallTimer()
    const banner = parseOrUndefined<{ text: string | null }>(event)
    if (banner === undefined) return
    for (const listener of bannerListeners) listener(banner)
  })
  source.addEventListener('scroll', (event) => {
    stopStallTimer()
    const direction = parseOrUndefined<ScrollDirection>(event)
    if (direction === undefined) return
    for (const listener of scrollListeners) listener(direction)
  })

  armStallTimer()

  return {
    dispatch: (action: Action) =>
      requestJson<AppState>('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    getState: () => requestJson<AppState>('/api/state'),
    getHistory: () => requestJson<HistoryEntry[]>('/api/history'),
    onState: (callback) => {
      stateListeners.add(callback)
      return () => {
        stateListeners.delete(callback)
      }
    },
    onBanner: (callback) => {
      bannerListeners.add(callback)
      return () => {
        bannerListeners.delete(callback)
      }
    },
    sendScroll: (direction) => {
      void fetcher(`${base}/api/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      }).catch(() => {
        // 瞬态副通道，失败不打断控制窗
      })
    },
    onScroll: (callback) => {
      scrollListeners.add(callback)
      return () => {
        scrollListeners.delete(callback)
      }
    },
  }
}

// 供测试与诊断使用：显式清理轮询定时器
export type { AppState }

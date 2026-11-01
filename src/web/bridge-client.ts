import type { Action, AppState, BridgeApi, HistoryEntry, ScrollDirection } from '../shared/types'

// W1：浏览器版 window.bridge——HTTP 请求 + 单条 SSE 连接。
// onState/onBanner/onScroll 共用一个 EventSource；EventSource 自带断线重连，
// 监听器只注册一次，重连不会重复回调。

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
}

export function createWebBridge(options: WebBridgeOptions = {}): BridgeApi {
  const fetcher: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  const base = options.baseUrl ?? ''

  const stateListeners = new Set<(state: AppState) => void>()
  const bannerListeners = new Set<(banner: { text: string | null }) => void>()
  const scrollListeners = new Set<(direction: ScrollDirection) => void>()

  const source = (options.createEventSource ?? ((url) => new EventSource(url) as unknown as EventSourceLike))(
    `${base}/api/events`,
  )

  const dispatchEvent = <T>(listeners: Set<(value: T) => void>, event: MessageEvent): void => {
    let value: T
    try {
      value = JSON.parse(event.data) as T
    } catch {
      return
    }
    for (const listener of listeners) listener(value)
  }

  source.addEventListener('state', (event) => dispatchEvent(stateListeners, event))
  source.addEventListener('banner', (event) => dispatchEvent(bannerListeners, event))
  source.addEventListener('scroll', (event) => dispatchEvent(scrollListeners, event))

  const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(`${base}${path}`, init)
    if (!response.ok) throw new Error(`请求 ${path} 失败：HTTP ${response.status}`)
    return (await response.json()) as T
  }

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
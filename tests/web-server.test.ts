import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Persistence } from '../src/main/store'
import { AppStateStore } from '../src/main/store'
import type { AppState, Selection } from '../src/shared/types'
import { MAX_BODY_BYTES, createWebServer, type WebServerHandle } from '../src/web/server'

// W1：Web 宿主服务端——真实 http.Server 监听端口 0，逐条覆盖 API/SSE/静态分发。

const noopPersistence: Persistence = {
  loadConfig: () => ({}),
  saveConfig: () => {},
  loadHistory: () => [],
  saveHistory: () => {},
}

interface SseEvent {
  event: string
  data: string
}

interface SseStream {
  next(): Promise<SseEvent>
  close(): void
}

function openSse(base: string): Promise<SseStream> {
  const controller = new AbortController()
  return fetch(`${base}/api/events`, {
    signal: controller.signal,
    headers: { accept: 'text/event-stream' },
  }).then((response) => {
    if (!response.body) throw new Error('SSE 响应缺少 body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const next = async (): Promise<SseEvent> => {
      for (;;) {
        const separator = buffer.indexOf('\n\n')
        if (separator >= 0) {
          const block = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          const eventLine = block.split('\n').find((line) => line.startsWith('event:'))
          if (!eventLine) continue // retry 注释块
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
          return { event: eventLine.slice(6).trim(), data }
        }
        const { value, done } = await reader.read()
        if (done) throw new Error('SSE 在事件到达前关闭')
        buffer += decoder.decode(value, { stream: true })
      }
    }
    return { next, close: () => controller.abort() }
  })
}

async function waitFor(condition: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('W1 Web 宿主服务端', () => {
  let staticRoot: string
  let store: AppStateStore
  let handle: WebServerHandle
  let base: string

  beforeEach(async () => {
    staticRoot = mkdtempSync(join(tmpdir(), 'bible-web-'))
    mkdirSync(join(staticRoot, 'control'), { recursive: true })
    mkdirSync(join(staticRoot, 'projection'), { recursive: true })
    mkdirSync(join(staticRoot, 'assets'), { recursive: true })
    mkdirSync(join(staticRoot, 'textures'), { recursive: true })
    mkdirSync(join(staticRoot, 'fonts'), { recursive: true })
    writeFileSync(join(staticRoot, 'control', 'index.html'), '<!doctype html><title>control</title>')
    writeFileSync(join(staticRoot, 'projection', 'index.html'), '<!doctype html><title>projection</title>')
    writeFileSync(join(staticRoot, 'assets', 'control-abcdef12.js'), 'console.log(1)')
    writeFileSync(join(staticRoot, 'textures', 'ink-mist.svg'), '<svg/>')
    writeFileSync(join(staticRoot, 'fonts', 'bible-serif-sc.woff2'), 'font')

    store = new AppStateStore(noopPersistence)
    handle = createWebServer({ store, staticRoot })
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()))
    const address = handle.server.address() as AddressInfo
    base = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await handle.close()
    rmSync(staticRoot, { recursive: true, force: true })
  })

  it('GET /api/state 返回与 store 一致的合法 AppState', async () => {
    const response = await fetch(`${base}/api/state`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    const state = (await response.json()) as AppState
    expect(Object.keys(state).sort()).toEqual(['display', 'projecting', 'selection', 'style'])
    expect(state).toEqual(JSON.parse(JSON.stringify(store.getState())))
  })

  it('GET /api/history 返回选区历史', async () => {
    const selection: Selection = { sn: 19, chapter: 23, verses: { from: 1, to: 3 } }
    store.dispatch({ type: 'select', selection })
    const response = await fetch(`${base}/api/history`)
    expect(response.status).toBe(200)
    const history = (await response.json()) as Array<{ selection: Selection }>
    expect(history).toHaveLength(1)
    expect(history[0]?.selection).toEqual(selection)
  })

  it('路由分发：GET / 与控制窗页面 / 投影页', async () => {
    const root = await fetch(`${base}/`)
    expect(root.status).toBe(200)
    expect(await root.text()).toContain('control')
    const control = await fetch(`${base}/control/`)
    expect(control.status).toBe(200)
    expect(await control.text()).toContain('control')
    const projection = await fetch(`${base}/projection/`)
    expect(projection.status).toBe(200)
    expect(await projection.text()).toContain('projection')
  })

  it('未知路径 404（API 为 JSON，静态为文本）', async () => {
    const api = await fetch(`${base}/api/nope`)
    expect(api.status).toBe(404)
    expect(api.headers.get('content-type')).toBe('application/json; charset=utf-8')
    const staticRes = await fetch(`${base}/nope.txt`)
    expect(staticRes.status).toBe(404)
  })

  it('方法不匹配 405', async () => {
    const response = await fetch(`${base}/api/state`, { method: 'POST', body: '{}' })
    expect(response.status).toBe(405)
  })

  it('/api/action 返回新状态并广播 state 事件', async () => {
    const stream = await openSse(base)
    const initial = await stream.next()
    expect(initial.event).toBe('state')

    const selection: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 17 } }
    const response = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: { type: 'select', selection } }),
    })
    expect(response.status).toBe(200)
    const next = (await response.json()) as AppState
    expect(next.selection).toEqual(selection)
    expect(store.getState().selection).toEqual(selection)

    const broadcast = await stream.next()
    expect(broadcast.event).toBe('state')
    expect(JSON.parse(broadcast.data)).toEqual(next)
    stream.close()
  })

  it('/api/scroll 只广播 scroll 事件且不改变状态', async () => {
    const stream = await openSse(base)
    const initial = await stream.next()
    const before = JSON.parse(initial.data) as AppState

    const response = await fetch(`${base}/api/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction: 'down' }),
    })
    expect(response.status).toBe(200)
    const event = await stream.next()
    expect(event.event).toBe('scroll')
    expect(JSON.parse(event.data)).toBe('down')
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(before)
    stream.close()
  })

  it('SSE 连接建立即推一次当前 state', async () => {
    store.dispatch({ type: 'projecting', value: true })
    const stream = await openSse(base)
    const event = await stream.next()
    expect(event.event).toBe('state')
    expect((JSON.parse(event.data) as AppState).projecting).toBe(true)
    stream.close()
  })

  it('banner 事件经 SSE 推送', async () => {
    const stream = await openSse(base)
    await stream.next()
    handle.broadcastBanner({ text: '电视请用 Win+P 扩展模式' })
    const event = await stream.next()
    expect(event.event).toBe('banner')
    expect(JSON.parse(event.data)).toEqual({ text: '电视请用 Win+P 扩展模式' })
    stream.close()
  })

  it('SSE 订阅者数量随连接建立增长、断开回落（不泄漏）', async () => {
    expect(handle.subscriberCount()).toBe(0)
    const stream = await openSse(base)
    await stream.next()
    await waitFor(() => handle.subscriberCount() === 1, '订阅者数量为 1')
    stream.close()
    await waitFor(() => handle.subscriberCount() === 0, '订阅者数量回落为 0')
  })

  it('POST 请求体超过 1MB 返回 413', async () => {
    const response = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: { type: 'projecting', value: true }, pad: 'x'.repeat(MAX_BODY_BYTES) }),
    })
    expect(response.status).toBe(413)
    expect(JSON.parse(JSON.stringify(store.getState())).projecting).toBe(false)
  })

  it('非法 JSON 返回 400 而不崩溃', async () => {
    const response = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    })
    expect(response.status).toBe(400)
    const followUp = await fetch(`${base}/api/state`)
    expect(followUp.status).toBe(200)
  })

  it('JSON null / 非对象体返回 400（不崩溃）', async () => {
    for (const body of ['null', '[]', '"text"']) {
      const response = await fetch(`${base}/api/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(response.status, `body=${body}`).toBe(400)
    }
    const scroll = await fetch(`${base}/api/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    })
    expect(scroll.status).toBe(400)
  })

  it('非法 action 返回 400', async () => {
    const response = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: { type: 'hack' } }),
    })
    expect(response.status).toBe(400)
  })

  it('非法 scroll 方向返回 400', async () => {
    const response = await fetch(`${base}/api/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction: 'sideways' }),
    })
    expect(response.status).toBe(400)
  })

  it('静态文件 MIME 与缓存：index.html 不缓存、hash 资源长缓存', async () => {
    const index = await fetch(`${base}/control/`)
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(index.headers.get('cache-control')).toBe('no-cache')

    const script = await fetch(`${base}/assets/control-abcdef12.js`)
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(script.headers.get('cache-control')).toContain('max-age=31536000')
    expect(script.headers.get('cache-control')).toContain('immutable')

    const svg = await fetch(`${base}/textures/ink-mist.svg`)
    expect(svg.headers.get('content-type')).toBe('image/svg+xml')
    expect(svg.headers.get('cache-control')).toBe('no-cache')

    const font = await fetch(`${base}/fonts/bible-serif-sc.woff2`)
    expect(font.headers.get('content-type')).toBe('font/woff2')
    expect(font.headers.get('cache-control')).toBe('no-cache')
  })

  it('静态路径穿越被拒绝', async () => {
    const response = await fetch(`${base}/../package.json`)
    expect([403, 404]).toContain(response.status)
  })
})
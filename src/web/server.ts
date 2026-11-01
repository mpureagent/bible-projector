import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { basename, extname, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import type { StoreLike } from '../main/ipc'
import type { ScrollDirection } from '../shared/types'
import { isAction } from '../shared/types'

// W1：Web 宿主服务端（纯 node:http，无运行期依赖）。
// /api/* 映射 Electron 的 IPC 契约；/api/events 为 SSE（state/banner/scroll），
// 静态目录与 Electron 一致（control/、projection/、textures/、fonts/），保障相对路径原样复用。

export const MAX_BODY_BYTES = 1024 * 1024

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

const HASHED_ASSET = /[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/

// gzip 只压文本类；woff2/png/jpg 本身已压缩，再压反而更大且白耗 CPU
const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg'])
// 小于此值的响应压缩收益抵不过头部开销
const COMPRESSIBLE_MIN_BYTES = 1024

export interface WebServerOptions {
  store: StoreLike
  staticRoot: string
}

export interface WebServerHandle {
  server: Server
  subscriberCount(): number
  broadcastBanner(banner: { text: string | null }): void
  close(): Promise<void>
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  })
  res.end(body)
}

function sendText(res: ServerResponse, status: number, text: string): void {
  const body = Buffer.from(text, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  })
  res.end(body)
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, {
    'Content-Type': 'application/json; charset=utf-8',
    Allow: allow,
  })
  res.end(JSON.stringify({ error: 'method not allowed' }))
}

interface BodyResult {
  tooLarge: boolean
  body: string
}

function readBody(req: IncomingMessage): Promise<BodyResult> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // 超限后不再缓存，继续排空请求体，保证客户端能读到 413 响应
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolveBody({ tooLarge, body: tooLarge ? '' : Buffer.concat(chunks).toString('utf8') })
    })
    req.on('error', reject)
  })
}

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

function cacheControl(pathname: string): string {
  if (basename(pathname) === 'index.html') return 'no-cache'
  // 仅 Vite 的 /assets/ 哈希产物长缓存；fonts/textures 等公共资源保持 no-cache
  if (pathname.startsWith('/assets/') && HASHED_ASSET.test(basename(pathname))) {
    return 'public, max-age=31536000, immutable'
  }
  // 字体是随包资源且体量大（宋体子集约 578KB），no-cache 会让每次访问都重下。
  // 文件名无 hash，故用 7 天而非 immutable：字体若更新，靠版本发布周期自然过期。
  if (pathname.startsWith('/fonts/') && /\.woff2?$/i.test(pathname)) {
    return 'public, max-age=604800'
  }
  return 'no-cache'
}

export function createWebServer(options: WebServerOptions): WebServerHandle {
  const subscribers = new Set<ServerResponse>()

  const writeEvent = (res: ServerResponse, event: string, payload: unknown): boolean => {
    if (res.writableEnded || res.destroyed) return false
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    return true
  }

  const broadcast = (event: string, payload: unknown): void => {
    for (const res of subscribers) {
      if (!writeEvent(res, event, payload)) subscribers.delete(res)
    }
  }

  const openEventStream = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // EventSource 断线重连间隔（验收 9：重启服务后 3 秒内恢复）
    res.write('retry: 1000\n\n')
    subscribers.add(res)
    writeEvent(res, 'state', options.store.getState())
    const cleanup = (): void => {
      subscribers.delete(res)
    }
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
  }

  const handleAction = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { tooLarge, body } = await readBody(req)
    if (tooLarge) {
      sendJson(res, 413, { error: 'payload too large' })
      return
    }
    const parsed = parseJsonBody(body)
    if (parsed === undefined) {
      sendJson(res, 400, { error: 'invalid JSON' })
      return
    }
    const action = typeof parsed === 'object' && parsed !== null ? (parsed as { action?: unknown }).action : undefined
    if (!isAction(action)) {
      sendJson(res, 400, { error: 'invalid action' })
      return
    }
    const next = options.store.dispatch(action)
    broadcast('state', next)
    sendJson(res, 200, next)
  }

  const handleScroll = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { tooLarge, body } = await readBody(req)
    if (tooLarge) {
      sendJson(res, 413, { error: 'payload too large' })
      return
    }
    const parsed = parseJsonBody(body)
    if (parsed === undefined) {
      sendJson(res, 400, { error: 'invalid JSON' })
      return
    }
    const direction =
      typeof parsed === 'object' && parsed !== null ? (parsed as { direction?: unknown }).direction : undefined
    if (direction !== 'up' && direction !== 'down') {
      sendJson(res, 400, { error: 'invalid direction' })
      return
    }
    broadcast('scroll', direction as ScrollDirection)
    sendJson(res, 200, { ok: true })
  }

  const serveStatic = (req: IncomingMessage, res: ServerResponse, pathname: string): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      methodNotAllowed(res, 'GET, HEAD')
      return
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      sendText(res, 400, 'Bad Request')
      return
    }
    let relative = decoded
    if (relative === '/') relative = '/control/index.html'
    else if (relative === '/control' || relative === '/projection') relative = `${relative}/index.html`
    else if (relative.endsWith('/')) relative += 'index.html'

    const root = resolve(options.staticRoot)
    const filePath = resolve(root, `.${relative}`)
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      sendText(res, 403, 'Forbidden')
      return
    }
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      sendText(res, 404, 'Not Found')
      return
    }
    if (!stat.isFile()) {
      sendText(res, 404, 'Not Found')
      return
    }
    const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    // 隧道带宽下 3.3MB 经文 bundle 要 28s，gzip 压到 1.1MB。
    // 用流式 gzip 而非 gzipSync：同步压缩 3.3MB 会阻塞事件循环，卡住 SSE 推送。
    const ext = extname(filePath).toLowerCase()
    const acceptEncoding = req.headers['accept-encoding']
    const wantsGzip =
      COMPRESSIBLE_EXT.has(ext) &&
      stat.size > COMPRESSIBLE_MIN_BYTES &&
      /\bgzip\b/.test(Array.isArray(acceptEncoding) ? acceptEncoding.join(',') : (acceptEncoding ?? ''))
    if (wantsGzip) {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
        'Cache-Control': cacheControl(relative),
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      const gzipStream = createGzip({ level: 6 })
      createReadStream(filePath)
        .on('error', () => {
          if (!res.writableEnded) res.destroy()
        })
        .pipe(gzipStream)
        .on('error', () => {
          if (!res.writableEnded) res.destroy()
        })
        .pipe(res)
      return
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl(relative),
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(filePath)
    stream.on('error', () => {
      if (!res.writableEnded) res.destroy()
    })
    stream.pipe(res)
  }

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    const pathname = url.pathname

    if (pathname === '/api/events') {
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      openEventStream(req, res)
      return
    }
    if (pathname === '/api/state') {
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      sendJson(res, 200, options.store.getState())
      return
    }
    if (pathname === '/api/history') {
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      sendJson(res, 200, options.store.getHistory())
      return
    }
    if (pathname === '/api/action') {
      if (req.method !== 'POST') {
        methodNotAllowed(res, 'POST')
        return
      }
      await handleAction(req, res)
      return
    }
    if (pathname === '/api/scroll') {
      if (req.method !== 'POST') {
        methodNotAllowed(res, 'POST')
        return
      }
      await handleScroll(req, res)
      return
    }
    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    serveStatic(req, res, pathname)
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      if (res.headersSent) {
        res.end()
      } else {
        sendJson(res, 500, { error: 'internal error' })
      }
    })
  })

  return {
    server,
    subscriberCount: () => subscribers.size,
    broadcastBanner: (banner) => broadcast('banner', banner),
    close: () =>
      new Promise<void>((resolveClose) => {
        for (const res of subscribers) {
          try {
            res.end()
          } catch {
            // 连接可能已断开；忽略即可
          }
        }
        subscribers.clear()
        server.close(() => resolveClose())
        const closable = server as unknown as { closeAllConnections?: () => void }
        closable.closeAllConnections?.()
      }),
  }
}
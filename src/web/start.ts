import { join } from 'node:path'
import { fsPersistence } from '../main/persist-fs'
import { AppStateStore } from '../main/store'
import { createWebServer } from './server'

// W1：Web 宿主启动入口（node dist/web-server/web/start.js）。
// 仅监听 127.0.0.1；PORT 默认 8787；静态目录默认 dist/web。

const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const staticRoot = process.env.WEB_ROOT ?? join(__dirname, '..', '..', 'web')
const dataDir = process.env.WEB_DATA_DIR ?? join(process.cwd(), '.web-userdata')

const store = new AppStateStore(fsPersistence(dataDir))
const web = createWebServer({ store, staticRoot })

web.server.listen(port, '127.0.0.1', () => {
  console.log(`[web] 圣言投屏 Web 宿主：http://127.0.0.1:${port}/control/`)
  console.log(`[web] 投影页：http://127.0.0.1:${port}/projection/`)
  console.log(`[web] 静态目录：${staticRoot}`)
  console.log(`[web] 数据目录：${dataDir}`)
})

const shutdown = (): void => {
  void web.close().then(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
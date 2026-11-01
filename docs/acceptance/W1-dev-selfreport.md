# W1 · Web 宿主开发自测报告

**工单**：`docs/tickets/W1-web-host.md`
**环境**：Linux x64 · Node v26.7.0 · npm 11.19.0 · Electron 22.3.27（浏览器级冒烟用其 Chromium 108 + Xvfb）
**结论**：验收标准 1–10 全部通过；运行期 `dependencies` 为空；共享渲染代码未改（仅按工单例外 `src/control/style-view.ts` 增加宿主能力判断）。

---

## 验收逐条

### 1. `npm test`：现有 265 全绿 + 新增 27 个

命令：

```bash
npm test
```

真实输出（尾部）：

```text
 ✓ tests/ui/style-view-host.test.ts (2 tests) 86ms

 Test Files  34 passed (34)
      Tests  292 passed (292)
   Start at  23:25:06
   Duration  49.01s (transform 4.43s, setup 0ms, collect 12.84s, tests 7.01s, environment 11.67s, prepare 5.90s)
```

- 292 = 原有 **265** + 新增 **27**（`tests/web-server.test.ts` 17 + `tests/web-bridge.test.ts` 8 + `tests/ui/style-view-host.test.ts` 2）。
- 原有测试文件一个未改：`git status --short` 中只有新增测试文件，无 `M tests/...`。
- 新增测试覆盖：路由分发/404/405、action 返回新状态并广播、scroll 只广播不改状态、SSE 初始 state、订阅/退订与订阅者数量回落、413/400、静态 MIME 与缓存、适配器 dispatch/getState/getHistory/onState/onBanner/onScroll/退订/共用单连接、宿主能力隐藏自定义图片。

### 2. `npm run build`：Electron 路径行为与产物不变

命令：

```bash
npm run build
grep -c 'Content-Security-Policy' dist/renderer/control/index.html
```

真实输出（尾部）：

```text
csp: /data/workspace/bible-projector/dist/renderer/control/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
csp: /data/workspace/bible-projector/dist/renderer/projection/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:

> bible-projector@0.9.2 typecheck
> tsc -p tsconfig.json
```

```text
1
```

`dist/renderer/control/index.html` 仍含唯一一条 CSP meta；`vite.config.ts`、`tsconfig.main.json`、`scripts/inject-csp.mjs` 均未改动。

### 3. `npm run build:web`：产物齐全

命令：

```bash
npm run build:web
ls dist/web/control/index.html dist/web/projection/index.html dist/web/textures/*.svg dist/web/fonts/*.woff2
```

真实输出（构建尾部）：

```text
../dist/web/projection/index.html                 2.49 kB │ gzip:     1.38 kB
../dist/web/control/index.html                   15.89 kB │ gzip:     4.21 kB
../dist/web/boot/projection-boot.js               0.08 kB │ gzip:     0.09 kB
../dist/web/assets/bridge-client-C8TJb6-6.js      0.97 kB │ gzip:     0.53 kB
../dist/web/boot/control-boot.js                  1.32 kB │ gzip:     0.81 kB
../dist/web/assets/projection-CBmz_8FS.js         1.54 kB │ gzip:     0.79 kB
../dist/web/assets/control-tihsOcnb.js           22.54 kB │ gzip:     6.51 kB
../dist/web/assets/scroll-Bva9Uxn4.js         1,179.71 kB │ gzip: 1,164.15 kB
✓ built in 2.19s
```

```text
dist/web/control/index.html
dist/web/fonts/bible-sans-sc.woff2
dist/web/fonts/bible-serif-sc.woff2
dist/web/projection/index.html
dist/web/textures/deep-water.svg
dist/web/textures/ink-mist.svg
dist/web/textures/rice-paper.svg
```

目录与 Electron 一致：`/control/index.html`、`/projection/index.html`、`/textures/`、`/fonts/`，`applyStageStyle()` 的 `../textures/xxx.svg` 可原样复用。

### 4. `curl /api/state` 返回合法 AppState

命令：

```bash
PORT=8787 node dist/web-server/web/start.js
curl -sS http://127.0.0.1:8787/api/state
```

真实输出：

```json
{"selection":null,"style":{"theme":"ink","fontSize":72,"hideVerseNumbers":false,"hideTitle":false,"fontFamily":"embedded-serif","color":null,"verseNumberColor":null,"currentColor":null,"background":null,"backgroundImage":null,"backgroundMode":"theme","lineHeight":1.7,"letterSpacing":0,"align":"center","margin":8},"display":null,"projecting":false}
```

字段与 Electron `AppState` 完全一致（`selection/style/display/projecting`）。

### 5. 浏览器打开 `/control/`：选经 → 预览出现经文；改主题/字号即时变化

浏览器级冒烟命令（临时脚本未入库；用 Electron 22 Chromium + Xvfb 驱动真实 Web 宿主）：

```bash
xvfb-run -a node_modules/.bin/electron --no-sandbox --disable-gpu --disable-dev-shm-usage /tmp/w1-browser-smoke.cjs
```

真实输出（节选）：

```json
"selected": "ok",
"previewTextOk": true,
"themeChanged": {
  "before": "rgb(16, 20, 24)",
  "after": "rgb(14, 27, 42)"
},
"fontChanged": {
  "before": 28.8,
  "after": 38.4
}
```

选经走真实 UI：搜索「约翰福音」→ 级联章 3 → 起 16 → 止 17；预览命中「神爱世人」。主题点选 `ocean` 后预览底色由 `rgb(16,20,24)` 变为 `rgb(14,27,42)`；字号 72→96 后预览字号实测 28.8px→38.4px。

### 6. 点「投屏」开新窗；投影与预览一致，改样式 1 秒内同步

同一冒烟命令真实输出（节选）：

```json
"projectionContentOk": true,
"projectionSync": {
  "matched": true,
  "elapsedMs": 59,
  "color": "rgb(43, 15, 20)",
  "budgetMs": 1000
}
```

点击 `#btn-project` 后通过 `window.open('/projection/')` 创建投影窗，投影正文含「神爱世人」；控制窗切 `wine` 主题后，投影窗 `#stage` 底色在 **59ms** 内与控制窗预览一致。

### 7. 投影滚动；控制窗 PgDn → 投影滚动一屏

同一冒烟命令真实输出（节选）：

```json
"scroll": {
  "before": { "top": 0, "height": 94692, "client": 575 },
  "pgdnMs": 63,
  "afterPgdn": 575,
  "drag": { "before": 575, "after": 825 }
}
```

载入诗篇 119 全章（`scrollHeight=94692`）。控制窗派发 `PageDown` 后投影 `scrollTop` 由 0 → 575（恰好一屏 `clientHeight=575`），耗时 63ms；投影内指针拖动后 `scrollTop` 575 → 825。

### 8. 关闭投影页后再点「投屏」能重新打开

同一冒烟命令真实输出（节选）：

```json
"refocus": {
  "before": { "projecting": true, "btn": "取消投屏" },
  "windowCountUnchanged": true,
  "stillProjecting": true,
  "projectionAlive": true
},
"reopen": {
  "resetMs": 322,
  "windowCount": 2
}
```

- 投影窗已开时再次点击：窗口数不变、状态仍为投屏中、原窗口存活（聚焦复用，不重复开）。
- 关闭投影页后：300ms 轮询检测到关闭并 dispatch `projecting=false`；按钮回「投屏」后再次点击，**322ms** 内成功创建新投影窗。

### 9. 重启服务端后 SSE 自动恢复并 3 秒内拿到状态

冒烟中 `SIGKILL` 服务端 → 等待 1.2s → 重新启动 → 向新服务端 POST `theme=forest`，观测控制窗 DOM（仅由 SSE `onState` 驱动）恢复：

```json
"sseReconnect": {
  "elapsedMs": 768,
  "within3s": true
}
```

服务端 SSE 首帧发送 `retry: 1000`；桥接器只注册一次 `state/banner/scroll` 监听器，重连不会重复回调。实测 **768ms** 内恢复并渲染新状态。

### 10. 无控制台报错；无横向溢出

同一冒烟命令真实输出（节选）：

```json
"overflow": {
  "control": 0,
  "projection": 0,
  "controlAfterRestart": 0
},
"consoleErrorsBeforeRestart": 0,
"consoleErrorsAfterRestart": 0,
"consoleErrors": []
```

控制窗、投影窗 `scrollWidth - clientWidth` 均为 **0**；正常操作与重启 SSE 全过程 console error 计数为 **0**。

---

## 附：curl 实测（/api/state、/api/action、/api/events）

```bash
curl -sS http://127.0.0.1:8787/api/state
curl -sS -X POST -H 'content-type: application/json' \
  -d '{"action":{"type":"select","selection":{"sn":43,"chapter":3,"verses":{"from":16,"to":17}}}}' \
  http://127.0.0.1:8787/api/action
curl -sS -N http://127.0.0.1:8787/api/events
```

真实输出：

```text
--- GET /api/state ---
{"selection":null,"style":{"theme":"ink","fontSize":72,"hideVerseNumbers":false,"hideTitle":false,"fontFamily":"embedded-serif","color":null,"verseNumberColor":null,"currentColor":null,"background":null,"backgroundImage":null,"backgroundMode":"theme","lineHeight":1.7,"letterSpacing":0,"align":"center","margin":8},"display":null,"projecting":false}

--- POST /api/action ---
{"selection":{"sn":43,"chapter":3,"verses":{"from":16,"to":17}},"style":{"theme":"ink","fontSize":72,"hideVerseNumbers":false,"hideTitle":false,"fontFamily":"embedded-serif","color":null,"verseNumberColor":null,"currentColor":null,"background":null,"backgroundImage":null,"backgroundMode":"theme","lineHeight":1.7,"letterSpacing":0,"align":"center","margin":8},"display":null,"projecting":false}

--- POST /api/scroll ---
{"ok":true}

--- GET /api/events (SSE captured) ---
retry: 1000

event: state
data: {"selection":null,"style":{"theme":"ink","fontSize":72,"hideVerseNumbers":false,"hideTitle":false,"fontFamily":"embedded-serif","color":null,"verseNumberColor":null,"currentColor":null,"background":null,"backgroundImage":null,"backgroundMode":"theme","lineHeight":1.7,"letterSpacing":0,"align":"center","margin":8},"display":null,"projecting":false}

event: state
data: {"selection":{"sn":43,"chapter":3,"verses":{"from":16,"to":17}},"style":{"theme":"ink","fontSize":72,"hideVerseNumbers":false,"hideTitle":false,"fontFamily":"embedded-serif","color":null,"verseNumberColor":null,"currentColor":null,"background":null,"backgroundImage":null,"backgroundMode":"theme","lineHeight":1.7,"letterSpacing":0,"align":"center","margin":8},"display":null,"projecting":false}

event: scroll
data: "down"
```

错误路径实测：

```text
--- 400 invalid json ---
HTTP 400
--- 413 too large ---
HTTP 413
```

静态缓存实测：

```text
--- /control/ ---
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-cache

--- /assets/control-tihsOcnb.js ---
HTTP/1.1 200 OK
Content-Type: text/javascript; charset=utf-8
Cache-Control: public, max-age=31536000, immutable

--- /fonts/bible-serif-sc.woff2 ---
Cache-Control: no-cache
```

---

## 约束核对

| 约束 | 结果 |
|---|---|
| 运行期 `dependencies` 为空 | `node -e "console.log(require('./package.json').dependencies)"` → `undefined`；服务端仅 `node:http/fs/path/url` |
| 共享渲染代码不动 | `passage.ts`、`render.ts`、其余 `control/*.ts`、`projection/*.ts` 未改；`style-view.ts` 仅按工单例外增加宿主能力判断 |
| 静态目录与 Electron 一致 | `/control/index.html`、`/projection/index.html`、`/textures/`、`/fonts/` |
| 现有测试不改 | 仅新增 3 个测试文件 |
| 不动 `generated/`、`data/`、打包配置 | 未修改；`generated/` 仍为构建产物且 gitignore |
| `npm run build` 行为不变 | `vite.config.ts`、`tsconfig.main.json`、CSP 注入脚本未改 |
| Lint / Typecheck | `npm run lint` 零输出通过；`npm run build` 末尾 typecheck 通过 |

## 新增/修改文件

```text
新增  src/web/server.ts                  Node 静态服务 + API + SSE
新增  src/web/start.ts                   启动入口（127.0.0.1，PORT=8787）
新增  src/web/bridge-client.ts           BridgeApi 浏览器实现（单条 SSE）
新增  src/control/web-boot.ts            控制窗桥接 + 投屏窗口生命周期
新增  src/projection/web-boot.ts         投影窗桥接
新增  vite.web.config.ts                 base '/' / dist/web / 双入口 / boot 注入
新增  tsconfig.web-server.json           服务端编译配置
新增  tests/web-server.test.ts           16 个服务端测试
新增  tests/web-bridge.test.ts           8 个适配器测试
新增  tests/ui/style-view-host.test.ts    2 个宿主能力测试
修改  src/control/style-view.ts          仅背景下拉按宿主能力隐藏“自定义图片”
修改  package.json                       增加 build:web / start:web，build 不变
修改  tsconfig.json                      纳入 vite.web.config.ts
修改  .gitignore                         忽略 .web-userdata/
```
# W1 · Web 宿主：服务端 + 桥接适配

**类型**：feat　**优先级**：P0　**依赖**：无　**预估**：中等

## 一、背景与目标

`v0.9.2` 是 Electron 双窗应用，验收必须装在 Windows 机器上。用户希望**先在浏览器里验收界面与样式**，Windows 只验兼容性（输入法、双屏、字体、投影仪清晰度）。

先行项目 `hymn-manager` 已完成同类改造（T8/T9），结论：渲染层几乎不动，新增一个 adapter 把 `window.bridge` 重新实现为 HTTP + 事件推送。本项目结构更简单，可直接照此路子做。

**目标**：同一个渲染层代码，既能跑在 Electron（现状），也能跑在 Node 静态服务器 + 浏览器里，功能与观感一致。

## 二、现状（已核实）

| 事实 | 位置 |
|---|---|
| 桥接契约只有 7 个成员 | `src/shared/types.ts` 的 `BridgeApi` |
| `window.bridge` 由 preload 用 contextBridge 注入 | `src/main/preload.ts` |
| 状态唯一所有者 `AppStateStore`（dispatch/getState/getHistory） | `src/main/store.ts` |
| IPC 注册已依赖注入（`IpcDeps`），测试用假 ipcMain | `src/main/ipc.ts` |
| 排版核共用（预览/投影同源） | `src/shared/passage.ts` |
| 经文数据打进 bundle，运行期不读文件 | `src/shared/bible.ts` 直接 import json |
| `generated/` 是构建产物，已 gitignore | `.gitignore` |
| 构建 base 为 `'./'`（为 Electron file://） | `vite.config.ts` |
| CSP 仅在 Electron 构建后注入 | `scripts/inject-csp.mjs` |

**运行期 `dependencies` 为空**是硬约束，服务端不得引入 express/koa/ws 之类。

## 三、范围

### 3.1 服务端（`src/web/server.ts`，纯 Node 内置模块）

只监听 127.0.0.1，端口取 `PORT` 环境变量，默认 8787。

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/` | 控制窗页面 |
| GET | `/projection/` | 投影页 |
| GET | `/api/state` | `AppState` JSON |
| GET | `/api/history` | `HistoryEntry[]` |
| POST | `/api/action` | body `{action}` → 调 `store.dispatch` → 返回 `AppState`，并广播 state 事件 |
| POST | `/api/scroll` | body `{direction}` → 广播 scroll 事件（**不改状态**） |
| GET | `/api/events` | SSE：`state` / `banner` / `scroll` 三类事件 |

要求：

- **SSE 用 `text/event-stream`**，连接建立即推一次当前 state（避免客户端首屏空白）
- 广播实现订阅者集合，客户端断开必须清理（监听 `close`），不得泄漏
- POST body 上限 1MB，超限返回 413
- 统一 `Content-Type: application/json; charset=utf-8`；非 GET 的非法 JSON 返回 400 而非崩溃
- 静态文件按扩展名给 MIME，`woff2` / `svg` / `png` / `css` / `js` 至少覆盖；带 hash 的资源给长缓存，`index.html` 不缓存
- **纯 Node `http` 模块**，不得引入依赖

### 3.2 桥接适配（`src/control/web-boot.ts`、`src/projection/web-boot.ts`）

浏览器里没有 preload，需自行定义 `window.bridge` 以满足 `BridgeApi`：

- `dispatch(action)` → POST `/api/action` → 返回新 state
- `getState()` / `getHistory()` → 对应 GET
- `onState(cb)` / `onBanner(cb)` / `onScroll(cb)` → 订阅同一 SSE 连接（每个页面仅一条连接），返回取消订阅函数
- `sendScroll(direction)` → POST `/api/scroll`
- **SSE 断线要自动重连**（`EventSource` 自带重连，但要确认不会重复注册回调导致重复渲染）

### 3.3 投屏在浏览器里的等价物

Electron 里投影是独立 BrowserWindow。浏览器里改为 `window.open('/projection/', ...)` 新标签/新窗。要求：

- 投屏按钮在 Web 下行为一致（点开→开新窗；再点→聚焦已开的窗，不重复开）
- 投影页同样订阅 SSE，状态实时同步
- 若浏览器拦截弹窗，必须给可读提示（不能静默失败）

### 3.4 构建

- 新增 `vite.web.config.ts`：`base: '/'`、`outDir: dist/web`、同样两个入口
- 新增 `npm run build:web`：数据 → 构建 →（不做 Electron CSP 注入）
- `publicDir` 仍是 `assets/`，使 `fonts/`、`textures/` 落到 `dist/web/` 下

**静态目录结构必须与 Electron 一致**，即控制窗位于 `/control/index.html`、投影页位于 `/projection/index.html`，纹理在 `/textures/`。原因：`applyStageStyle()` 里写死了 `url("../textures/xxx.svg")` 相对路径，**目录结构一致才能原样复用，不必改共享代码**。

### 3.5 明确不做

- **自定义背景图片**：现在是让用户填本地绝对路径，浏览器做不到。Web 下把该选项从背景模式下拉里隐藏，并在 `applyStageStyle` 之外的地方保持 Electron 行为不变（**不得为 Web 改动共享渲染逻辑**）
- 远程/多用户访问、鉴权、HTTPS：本机验收用，只监听 127.0.0.1，对外暴露交给隧道
- 不新增任何运行期依赖

## 四、验收标准

1. `npm test` **现有 265 个测试全绿**，一个不许改；新增服务端与适配器测试 **≥12 个**
2. `npm run build`（Electron 路径）行为与产物不变：`dist/renderer/control/index.html` 仍含 CSP meta
3. `npm run build:web` 产出 `dist/web/control/index.html`、`dist/web/projection/index.html`、`dist/web/textures/*.svg`、`dist/web/fonts/*.woff2`
4. 启动后 `curl /api/state` 返回合法 `AppState`，字段与 Electron 版一致
5. 浏览器打开 `/control/`：选经 → 预览出现经文；改主题/字号 → 预览即时变化
6. 点「投屏」→ 新标签页打开投影，**投影内容与预览一致**；控制窗改样式 → 投影页 1 秒内同步
7. 投影页滚轮/拖动滚动生效；控制窗发 `PgDn` → 投影页滚动一屏
8. 关闭投影页后再点「投屏」→ 能重新打开（不得因为记录着"已开"而拒绝）
9. 断开 SSE（重启服务端）后页面自动恢复并在 3 秒内重新拿到状态
10. 全程无控制台报错；`document.documentElement.scrollWidth - clientWidth = 0`

## 五、测试要求（TDD）

新增测试至少覆盖：

- 路由分发（GET/POST、未知路径 404）
- `/api/action` 返回新状态且触发广播
- `/api/scroll` 只广播不改状态
- SSE 订阅/退订、断开后订阅者数量回落
- body 超限 413、非法 JSON 400
- 适配器：dispatch 走 POST、onState 收到 SSE 消息后回调、取消订阅后不再回调

服务端测试用真实 `http.Server` 监听端口 0（系统分配），测完关闭，不留端口占用。

## 六、交付物

- 代码 + 测试
- `docs/acceptance/W1-dev-selfreport.md`：自测报告，逐条对应验收标准 1–10，写明实测命令与输出
- **不得**写入 `docs/acceptance/` 其他文件（PM 专用）

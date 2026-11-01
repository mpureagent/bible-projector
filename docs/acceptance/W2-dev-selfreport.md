# W2 开发自测报告（手机端布局）

日期：2026-11-01
工单：`docs/tickets/W2-mobile-layout.md`
开发：Qoder
结论：**验收标准 1–5 全部通过**；390/768 单栏两态可完整选经、预览、改样式、投屏，1440/1920 双栏零回归，四档 console 均 0 报错。

## 一、验收 1：测试全绿，新增 ≥6，现有测试未改

现有测试文件零改动：

```text
$ git diff --name-only -- tests/
(空)
```

仅新增两个测试文件：`tests/ui/layout-controller.test.ts`（12 例）、`tests/ui/cascade-narrow.test.ts`（7 例），共 19 例。

```text
$ npm test
 Test Files  36 passed (36)
      Tests  311 passed (311)
```

即原 292 例 + 新增 19 例 = 311 全绿。新增覆盖：

- 窄屏初始 `list`：书卷栏可见、预览栏 `hidden`、无返回按钮
- 选中经文自动进 `detail`；返回键回 `list`
- 初始 hydration 已带选区仍停在 `list`（验收：初始态看得到书卷列表）
- 同选区状态刷新不把用户从列表拽回 detail；外部换选区经 SSE 自动进 detail
- 桌面宽度双栏都在、无返回按钮（即使内部 view=detail）
- 跨断点 900px 双向切换
- **隐藏用 `hidden` 属性而非内联 `display:none`，预览元素始终留在 DOM**
- 网格 `minmax(0,1fr)` + 子项 `min-width:0`、样式底部抽屉 70vh、窄屏触控 ≥44px
- 级联窄屏分步：书→章→节范围、上一步、✕/遮罩关闭、桌面四列不变

附带 lint（改动文件无告警）：

```text
$ npm run lint
> eslint .
(exit 0)
```

## 二、验收 2：390×844

实测方式：构建后的 Web 产物 + Node 宿主 + Electron 22（真实 Chromium）在 Xvfb 中以精确内容尺寸 390×844 打开，脚本执行真实点击/键盘状态流并读取 DOM。`innerWidth` 实测 = 390，纵向滚动条占 15px 时 `clientWidth=375`。

| 场景 | clientWidth | scrollWidth | 溢出 | 预览面板宽 | 状态 |
|---|---:|---:|---:|---:|---|
| 初始（list） | 375 | 375 | **0** | 0（hidden） | 书卷列表可见，42 个书卷/搜索/Tab 按钮 |
| 选经后（detail） | 390 | 390 | **0** | **366** | 经文「创世记 1:1」，返回按钮可见 |
| 字号 200（preview 80px） | 375 | 375 | **0** | 351 | 无横向溢出 |
| 返回列表 | 375 | 375 | **0** | 0（hidden） | 回到 list，返回按钮消失 |

选经流程实测：初始书卷列表 → 点「创世记」→ 级联弹窗进入「选择章」步骤 → 点「1」→「选择节范围」双列（起始节/结束节）→ 点 1–1 → 自动进入 detail，预览渲染 `创世记 1:1`，出现「‹ 返回列表」，点击后回 list。

外部 SSE 联动实测（在 list 态由另一客户端改状态）：

- 同选区仅改字号：视图保持 `list`，未被拽回 detail
- 换选区为「约翰福音 3:16-17」：自动进入 `detail`，返回按钮可见

**样式面板**：

```json
{"panel":{"top":253,"bottom":844,"width":390,"height":591},
 "bottomPinned":true,"maxHeight":"590.8px","overflowY":"auto","scrollable":true}
```

贴底（bottom=844=视口高）、总高 591px = 70vh（`maxHeight` 590.8px 四舍五入）、内容可滚动（scrollHeight 1015 > clientHeight 590），✕ 关闭后 `#style-drawer.hidden=true`。

**级联弹窗**：

```json
章步骤:     {"visibleColumns":["章"],"noHorizontalScroll":true,"stepBackVisible":true,"title":"选经 · 选择章"}
节范围步骤: {"visibleColumns":["起始节","结束节"],"stepVerses":true,"noHorizontalScroll":true,"stepBackVisible":true}
```

弹窗宽 368px，列容器 `scrollWidth<=clientWidth`，无横向滚动；✕/遮罩关闭实测可用。

**触控区**：对当前可见的每个 `<button>` 审计 `getBoundingClientRect().height`，<44px 的数量：

```text
initial: 0 / 42   detail: 0 / 15   cascade: 0 / 94   cascadeVerses: 0 / 75   style: 0 / 27
```

## 三、验收 3：768×1024（平板）

| 场景 | clientWidth | scrollWidth | 溢出 | 预览面板宽 | 状态 |
|---|---:|---:|---:|---:|---|
| 初始（list） | 753 | 753 | **0** | 0（hidden） | 单栏书卷列表 |
| 选经后（detail） | 768 | 768 | **0** | **744** | 返回按钮可见 |
| 字号 200 | 768 | 768 | **0** | 744 | 无横向溢出 |

样式面板高度 717px（70vh=716.8px），贴底、可滚动、可关闭；级联为「书→章→节范围」分步，无横向滚动；可见按钮触控区 <44px 数量全为 0。返回列表、外部 SSE 自动进 detail 均实测通过。

## 四、验收 4：桌面回归（1440×900 / 1920×1080）

| 视口 | 布局列宽 | 左栏宽 | 右栏/预览宽 | 返回按钮 | 级联列 |
|---|---:|---:|---:|---|---|
| 1440×900 | `340px 1050px` | 340 | 1050 | 不渲染 | 书/章/起始/结束 四列 |
| 1920×1080 | `340px 1530px` | 340 | 1530 | 不渲染 | 书/章/起始/结束 四列 |

- 初始与选经后左右栏均可见（`left.hidden=false`、`right.hidden=false`）
- `backRendered=false`，页面无返回按钮
- 栏宽与 W1 一致：左 340px；右栏 = 视口 − 左右内边距 36 − 340 − 间距 14（1440→1050，1920→1530）
- 两档横向溢出均为 0；字号 200 仍为 0
- 桌面样式面板仍为右侧抽屉（`maxHeight:"none"`，宽 373 = 原 340 content + 32 padding + 1 border，与 W1 一致）
- 桌面可见按钮沿用 W1 原尺寸（Tab 36px、书卷 41px 等），未做 W2 手机触控放大，符合“桌面零变化”

## 五、验收 5：console 零报错

四档各自监听 Chromium `console-message`，结果全部为：

```json
{"errors":[],"warnings":[],"error":null}
```

## 六、约束核对

| 约束 | 实测 |
|---|---|
| `src/shared/passage.ts` 排版核一行不动 | `git diff --stat -- src/shared/passage.ts` 为空 |
| 不改 Electron 窗口行为 | 未改 `src/main/*`、`src/projection/*` 或窗口创建代码 |
| 不用 `display:none` 砍掉预览面板 | 左右栏/返回按钮由 `hidden` 属性切换（`ControlLayout`），预览元素始终在 DOM；无 `#preview-panel{display:none}` 规则 |
| 投屏提示不假设第二块屏 | `grep -rn "第二块屏\|副屏" src` → 无匹配 |
| Electron 构建 CSP 仍在 | `grep -c "Content-Security-Policy" dist/renderer/control/index.html` → `1` |

## 七、命令与真实输出

```text
$ npm test
 Test Files  36 passed (36)
      Tests  311 passed (311)

$ npm run build
> tsc -p tsconfig.main.json
✓ built in 2.06s
csp: dist/renderer/control/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
csp: dist/renderer/projection/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
> tsc -p tsconfig.json
(exit 0)

$ grep -c "Content-Security-Policy" dist/renderer/control/index.html
1

$ npm run build:web
✓ built in 2.04s
(exit 0)

$ npm run lint
(exit 0)
```

四档实测命令（Web 宿主 + Electron 22 / Xvfb）：

```bash
PORT=8799 WEB_ROOT=$PWD/dist/web WEB_DATA_DIR=/tmp/w2-webdata \
  node dist/web-server/web/start.js

xvfb-run -a -s "-screen 0 2560x1600x24" \
  ./node_modules/.bin/electron --no-sandbox --disable-gpu /tmp/w2-measure.cjs
```

测量脚本按 390×844、768×1024、1440×900、1920×1080 依次以 `useContentSize: true` 建窗，执行真实选经点击、样式抽屉开关、字号 200、返回列表及外部 SSE 换选区，读取 `documentElement.scrollWidth/clientWidth`、面板 `getBoundingClientRect()`、返回按钮渲染状态与 `console-message`。

## 八、变更文件

新增：

- `src/control/layout-controller.ts`：900px 断点、`narrowView: 'list' | 'detail'` 状态机、`hidden` 驱动左右栏/返回按钮
- `tests/ui/layout-controller.test.ts`（12 例）
- `tests/ui/cascade-narrow.test.ts`（7 例）

修改：

- `src/control/index.html`：`minmax(0,1fr)` + `min-width:0`、≤900px 媒体查询、返回按钮、触控 ≥44px、底部样式抽屉、级联单列/双列分步
- `src/control/cascade-view.ts`：窄屏分步（书→章→节范围）、上一步、跨断点重排；桌面四列不变
- `src/control/main.ts`：接入 `ControlLayout`、返回按钮、选中/历史回调进 detail、媒体查询同步级联
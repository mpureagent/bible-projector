# W3 开发自测报告（当前节高亮）

日期：2026-11-02
工单：`docs/tickets/W3-current-verse-highlight.md`
开发：Qoder

结论：**验收标准 1–10 全部通过**。当前节高亮已与选区解耦，随点击 / 滚动停下 / 方向键移动；P0「↓ 键压缩选区」在投影窗与控制窗两条入口均已修复；高亮变化只走增量 DOM 路径。

## 实现摘要

- **状态层**：`AppState.currentVerse`（与 `selection` 解耦）；`highlight` reducer 只改 `currentVerse`，越界忽略；`select` 重置为新选区第一节，`selection=null` 时置 `null`。
- **渲染层**：`resolveCurrentVerse()` 是投影与预览的唯一取值来源；`applyVerseHighlight()` 只增删 `.current` 与内联 `color/backgroundColor`。投影/预览用「选区键 + 样式 JSON 键」判断是否整段重建，状态回包即使被克隆成新对象也不会误重建。
- **滚动**：`pickTopVerse()` / `verseAtTop()` 实现「屏幕顶部第一行」；滚动事件 rAF 合并、停下后 120ms 防抖结算；拖动延后到松手，惯性结束才结算；拖动后的 click 被抑制。
- **交互**：投影与控制窗预览均支持点击取节；点击/滚动来源的高亮**不做**出屏跟随，方向键与换经仍保留原有跟随。
- **样式**：`ProjectionStyle.hideCurrent`，样式面板「显隐」新增「隐藏当前节高亮」。
- **P0**：投影窗 ↑↓ 改发 `highlight`；控制窗 `mapKey` 对新状态同样只产出 `highlight`，不再产生 `select`。

## 验收 1：测试全绿，新增 ≥14，现有测试零改动

现有测试文件零改动：

```text
$ git diff --name-only -- tests/
(空)
```

仅新增 6 个测试文件，共 **39 例**：

| 文件 | 例数 | 覆盖 |
|---|---:|---|
| `tests/store-highlight.test.ts` | 10 | highlight 不改 selection / 越界忽略 / select 重置 / 历史与持久化 / isAction / hideCurrent |
| `tests/ui/current-verse.test.ts` | 14 | 取值来源 / hideCurrent / 增量不重建 / 顶部第一行纯函数 / 预览同源 / 样式面板 |
| `tests/ui/keymap-highlight.test.ts` | 3 | 控制窗 ↑↓ 只发 highlight（不压缩选区） |
| `tests/ui/projection-arrows.test.ts` | 4 | 投影窗 P0 回归、边界无动作 |
| `tests/ui/projection-scroll-integration.test.ts` | 4 | 滚动取节、快速滚动、点击不滚动、长节点击不滚动 |
| `tests/ui/scroll-highlight.test.ts` | 4 | rAF+防抖、拖动延后、2 秒连续滚动、拖动抑制 click |

```text
$ npm test
 Test Files  42 passed (42)
      Tests  355 passed (355)
```

即原 316 例 + 新增 39 例 = 355 全绿。

## 验收 2：P0 回归（真实 Electron 22 + Chromium）

选中约翰福音 3:16-21（字号 120），投影窗内连按 ↓ 5 次：

```text
down#1 selection={'from': 16, 'to': 21} currentVerse=17 projectionVerses=6 title=约翰福音 · 第 3 章 · 16-21 节
down#2 selection={'from': 16, 'to': 21} currentVerse=18 projectionVerses=6 title=约翰福音 · 第 3 章 · 16-21 节
down#3 selection={'from': 16, 'to': 21} currentVerse=19 projectionVerses=6 title=约翰福音 · 第 3 章 · 16-21 节
down#4 selection={'from': 16, 'to': 21} currentVerse=20 projectionVerses=6 title=约翰福音 · 第 3 章 · 16-21 节
down#5 selection={'from': 16, 'to': 21} currentVerse=21 projectionVerses=6 title=约翰福音 · 第 3 章 · 16-21 节
extra down (boundary): selection 16-21, currentVerse=21
```

selection 始终 `16-21`，投影始终 6 节，标题始终「16-21 节」；到 21 后停住。同一组数据也在 `npm test` 中输出：

```text
[W3] ↓#1 selection=3:16-21 currentVerse=17 projectionVerses=6
...
[W3] ↓#5 selection=3:16-21 currentVerse=21 projectionVerses=6
```

## 验收 3：点击某节 → 点亮、selection 不变、不滚动

真实 Electron 中，先滚到 19 节可见处，再点击 19 节：

```json
{
  "currentBefore": "18",
  "current": "19",
  "clickedVisible": true,
  "scrollBefore": 2856,
  "scrollAfter": 2856,
  "selection": {"sn":43,"chapter":3,"verses":{"from":16,"to":21}},
  "currentVerse": 19
}
```

点击前后 `scrollTop` 完全一致；另有一条自动化用例专门点击「比视口更高的部分可见节」，验证不会因原有底对齐跟随而滚动。

## 验收 4：滚到中段停下 → 顶部第一行

真实 Electron（`scrollHeight=5607`、`clientHeight=695`）：

```json
{
  "scrollTop": 2456,
  "scrollHeight": 5607,
  "clientHeight": 695,
  "current": "18",
  "rectTop": -199,
  "rectBottom": 789,
  "relativeTop": -199
}
```

18 节跨过视口顶边（top=-199、bottom=789，视口 0..695），是顶部边缘往下第一个与视口相交的节，因此被点亮；状态 `currentVerse=18`，selection 仍为 `16-21`，且 `scrollTop` 保持在 2456（未被跟随顶走）。

## 验收 5：高亮移动无整段重渲染

真实 Electron：记录 `[data-verse="18"]` 元素引用，按 ↑ 移动高亮后比较：

```json
{"sameNode": true, "beforeCurrent": false, "afterCurrent": false, "current": "20"}
```

同一节元素引用不变，只切换了 `.current` 与内联色。自动化用例还覆盖了「状态回包为克隆对象但值相同」仍不重建、只有 selection/style 变化才重建。

## 验收 6：连续滚动 2 秒的派发次数

`ScrollController` 层（rAF 合并 + 120ms 防抖，fake timers）：

```text
[W3] 125 scroll events / 2000ms → 1 settle dispatch
```

真实 Electron 中连续滚动 2 秒（125 次 scroll 事件，线性下滚 2500px，跨越多节），以 `currentVerse` 变更的 state 事件计数：

```json
{"events": 125, "highlightStateChanges": 1, "scrollTop": 2480, "current": "18"}
```

不是每帧一次，也不是每次 scroll 一次；只在停下后结算一次。

## 验收 7：hideCurrent

真实 Electron 打开 `hideCurrent=true` 后：

```json
{"state": {"hideCurrent": true}, "dom": {"projectionCurrents": 0, "previewCurrents": 0}}
```

两窗均无 `.current`；样式面板复选框 dispatch `{hideCurrent:true}` 并随状态回显（自动化用例）。重新关闭后高亮恢复。

## 验收 8：换经文 → 高亮回到新选区第一节

真实 Electron 换到创世记 1:2-5：

```json
{"selection": {"sn":1,"chapter":1,"verses":{"from":2,"to":5}}, "currentVerse": 2}
```

## 验收 9：控制窗预览与投影一致

真实 Electron：

```json
{"control": {"preview": "17", "currentVerse": 17}, "projection": "17"}
```

预览与投影同时跟随状态中的 `currentVerse`；预览自身也支持点击/滚动取节，且高亮变化不重建 DOM。

## 验收 10：Electron / Web 构建与 CSP

```text
$ npm run build
✓ built in 1.96s
csp: dist/renderer/control/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
csp: dist/renderer/projection/index.html injected directive=default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
> tsc -p tsconfig.json

$ npm run build:web
✓ built in 2.30s
> tsc -p tsconfig.web-server.json
```

Web 宿主运行时冒烟（Node 服务 + HTTP）：

```text
POST /api/action select 43:3:16-21  → selection 16-21, currentVerse 16
POST /api/action highlight 19       → currentVerse 19
POST /api/action highlight 25       → currentVerse 仍 19（越界忽略）
GET  /api/state                     → selection 16-21, currentVerse 19
```

## 实现取舍与偏差说明（需 PM 知悉）

为同时满足「Action 加 highlight」与「现有 316 条不得修改且全绿」，类型层做了两处最小妥协：

1. **`Action` 保持原有 4 个成员，新增 `HighlightAction`，dispatch 契约改为 `AppAction = Action | HighlightAction`**。
   原因：现有 `tests/ui/keyboard.test.ts` 对 `Action` 做了无 `default` 的穷尽 switch；把 highlight 并进 `Action` 会让 `tsc` 报 TS2366，而该测试文件不能改。`store.dispatch`、IPC、preload、Web 桥接均已接受 `AppAction`，运行时行为与工单一致。
2. **`AppState.currentVerse` 与 `ProjectionStyle.hideCurrent` 为可选字段，初始/默认不新增枚举自有键**。
   原因：现有测试对初始状态键集合与样式对象做了精确全等断言（如 `Object.keys(state)`、`toEqual(style)`）。因此：
   - 初始无选区时 `currentVerse` 缺省（语义为“无点亮”），首次 `select` 后必定是 `number`；
   - `hideCurrent` 在 `DEFAULT_STYLE` 中缺省，读取处一律按 `false` 处理，显式 `true` 正常生效并持久化。
   如果 PM 愿意同步调整这几处精确断言，可把初始值直接改为字面量 `null` / `false`，行为不变。

另：`npm run lint` 仍有一处 **既有** 告警 `src/web/bridge-client.ts: pollTimer is assigned but never used`；该变量在本次改动前的 HEAD 中已如此，与本工单无关（本次对该文件只改了两行类型引用）。不在验收命令范围内，未做顺手修改。

## 变更文件

```text
src/shared/types.ts           currentVerse / HighlightAction / hideCurrent / isAction
src/main/store.ts             DEFAULT_STYLE + select/highlight reducer
src/main/ipc.ts               StoreLike 接受 AppAction
src/main/preload.ts           dispatch 接受 AppAction
src/shared/passage.ts         resolveCurrentVerse / buildStatePassage / applyVerseHighlight / hideCurrent
src/projection/render.ts      按值键增量渲染
src/projection/scroll.ts      顶部第一行取节 + 停下结算 + 拖动/惯性/点击抑制
src/projection/main.ts        方向键只发 highlight、点击取节、滚动取节、来源感知跟随
src/control/keymap.ts         moveHighlight；新状态 ↑↓ 不再产生 select
src/control/keyboard.ts       highlight 独立通道
src/control/main.ts           预览高亮/点击接线
src/control/preview-view.ts   增量渲染 + 点击/滚动取节
src/control/style-view.ts     「隐藏当前节高亮」开关
src/web/bridge-client.ts      dispatch 接受 AppAction
```

未修改 `docs/acceptance/` 下任何既有文件。
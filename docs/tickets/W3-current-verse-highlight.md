# W3 · 当前节高亮：与选区解耦，随滚动/点击/方向键移动

**类型**：feat + bugfix　**优先级**：P0（含数据破坏性缺陷）　**依赖**：无

## 一、用户诉求（原话）

> 经文小节的高亮状态不能随着阅读移动吗？不能通过点击那一小节让它高亮吗

补充确认：滚动时以**屏幕顶部第一行**作为阅读起点（不是屏幕正中）。

## 二、现状与问题

### 2.1 高亮不会动

`AppState` 里**没有"当前节"字段**。高亮位置由 `selection.verses.from` 兼任，而滚动是纯 DOM 行为、不影响状态，所以滚动后高亮永远停在第一节。

### 2.2 点击无响应

`src/projection/` 下只有 `pointerdown/move/up`（拖动滚动），**没有任何 click 处理**。整个投影页点不动。

### 2.3 P0 破坏性缺陷：↓ 键会砍掉经文

投影窗 `main.ts` 的 ↑↓ 处理：

```ts
const verse = event.key === 'ArrowDown' ? sel.verses.from + 1 : sel.verses.from - 1
void window.bridge.dispatch({ type: 'select', selection: { ...sel, verses: { from: verse, to: verse } } })
```

它把 `verses` 直接改成 `{from: verse, to: verse}`——**选区被压成单节**。

PM 实测（约翰福音 3:16-21，按一次 ↓）：

| | 之前 | 之后 |
|---|---|---|
| 选区 | `16-21` | **`18-18`** |
| 投影节数 | 6 | **1** |
| 标题 | 「16-21 节」 | 「18-18 节」 |

即：一个原本用来"移动高亮"的按键，实际效果是**把整段经文删掉**。教会场景下这会在投屏中途丢内容。

## 三、根因

`selection` 同时承担两个语义：

1. **渲染范围**——投影要显示哪几节
2. **点亮位置**——哪一节高亮

一个字段两种含义，于是"移动高亮"必然要改渲染范围。必须拆开。

## 四、方案

### 4.1 状态层

```ts
// AppState 新增
currentVerse: number | null      // 当前点亮节；null = 不点亮

// Action 新增
| { type: 'highlight'; verse: number | null }
```

reducer：

- `highlight` → 只改 `currentVerse`，**不得触碰 `selection`**
- `select` → 设 `selection`，并把 `currentVerse` 重置为 `selection.verses.from`（换经文回到第一节，保持现有观感）
- `selection` 为 null 时 `currentVerse` 也置 null

**边界校验**：`currentVerse` 必须落在 `selection.verses.from..to` 之内。越界值一律忽略（不报错、不夹取），避免脏状态渲染出无对应节的空高亮。

### 4.2 渲染层

`buildPassage` 的 `opts.currentVerse` 改为接收状态里的 `currentVerse`（当前传入的是 `sel.verses.from`，两处调用点：

- `src/projection/render.ts`
- `src/control/preview-view.ts`

预览与投影同源，两者都跟随）。

### 4.3 三处交互

| 交互 | 行为 |
|---|---|
| **点击某一节** | dispatch `highlight` 到该节。**不滚动**——用户点的节本来就在眼前 |
| **滚动停下** | 取**屏幕顶部第一行**所在的节，dispatch `highlight` |
| **↑ ↓ 键** | 只移动 `currentVerse`（±1，夹在选区范围内），**不再改 selection**——修掉 2.3 的 P0 缺陷 |
| 换经文 | `currentVerse` 重置为新选区第一节 |

### 4.4 滚动取节的判据（用户已定）

**屏幕顶部第一行**。即：视口顶部边缘往下，第一个与视口相交的 `[data-verse]` 元素。

实现建议：

- 遍历 `[data-verse]`，找第一个满足 `rect.bottom > stage.getBoundingClientRect().top` 的元素
- 用 `requestAnimationFrame` 节流，避免每帧都算
- 只在值真正变化时 dispatch（否则滚动会疯狂打点）
- 拖动中可延后到松手，滚动惯性结束前不要反复 dispatch

### 4.5 增量渲染硬约束（必须遵守）

当前每次状态变化都 `replaceChildren()` 整段重建。若高亮变化也走这条路，会形成：

```
滚动 → 改高亮 → 整段重渲染 → 滚动位置被扰动 → 触发 scroll → 再改高亮 → …
```

画面抖动、滚动跑偏。

**规定**：

- 高亮变化必须走**增量路径**：只切换 `.current` 类的增删，并设置/清除内联 `color` / `backgroundColor`，**不得重建 DOM**
- 只有当 `selection` 或 `style` 变化时才允许整段重渲染
- 现有 `renderProjection` 需增加"仅在必要时重建"的判断，或拆出 `applyHighlight(state)` 单独调用

### 4.6 样式开关

新增 `ProjectionStyle` 字段：

```ts
hideCurrent: boolean   // 默认 false；true = 整段不点亮任何节
```

理由：有些场景整段经文只是展示，不需要高亮框。加进样式面板「显隐」区块，与「隐藏节号」「隐藏书卷标题」并列。

需同步：`DEFAULT_STYLE`、`sanitizePatch` 无需特殊处理（布尔透传）、样式面板 UI、`buildPassage` 在 `hideCurrent` 时无视 `currentVerse`。

## 五、验收标准

1. `npm test` 现有 **316 个测试全绿**，新增 ≥14 个
2. **P0 回归**：选中 3:16-21，按 ↓ 5 次——`selection` 必须始终是 `16-21`，投影始终 6 节；`currentVerse` 从 16 递增到 21 后停住
3. 点某节 → 该节点亮，`selection` 不变，滚动位置不变
4. 滚到中段停下 → 点亮的是**屏幕顶部第一行**那一节（给出实测的 scrollTop、首行节的节号与屏幕坐标）
5. 高亮移动时**无整段重渲染**：用 MutationObserver 或对比 DOM 节点引用证明（同一节元素的引用不变）
6. 滚动过程中高亮不来回跳（连续滚动 2 秒内 dispatch 次数要给出实测值，不得每帧一次）
7. `hideCurrent=true` → 无任何 `.current` 元素；样式面板开关生效
8. 换经文 → 高亮回到新选区第一节
9. 控制窗预览的高亮与投影一致
10. Electron 构建与 Web 构建均通过；CSP 仍在

## 六、明确不做

- 不改滚动的手感参数（惯性、衰减）
- 不做"高亮跟随滚动自动居中"（用户要的是顶部第一行，不是自动滚到中间）
- 不改 `passage.ts` 的排版逻辑（段落流、节号上标），只改 `currentVerse` 的取值来源与增量更新方式

## 七、交付

- 代码 + 测试
- `docs/acceptance/W3-dev-selfreport.md`：逐条对应第五节 1–10，附命令与真实输出
- 注意：`docs/acceptance/W1-report.md`、`W2-report.md`、`performance-notes.md`、`sse-tunnel-fix.md` 是 PM 的，不要动

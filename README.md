# 圣言投屏 · bible-projector

离线双窗圣经投屏：**控制窗选经，电视/投影上屏**，全程零联网、零云端、零依赖（运行期 `dependencies` 为空）。

教会聚会场景做的工具：操作的人坐在笔记本前选经文，会众看的是第二块屏（电视或投影）。所以一切设计围绕两件事——**上屏内容要好看**，**台下操作要不出错**。

版本 `v0.9.2`｜265 个测试｜Windows 7 SP1 x64 / 10 / 11 x64

---

## 它能做什么

**投屏模型**：投影窗平时不存在，点「投屏」才创建并上屏、点「取消投屏」销毁。有外接屏自动全屏到第二屏；单屏时退化为本机浮动窗「投影预览」，**不劫持主屏**。

**选经**：四列一体级联弹窗（书 | 章 | 起始节 | 结束节），选完自动关窗，不跨章。支持拼音首字母搜索——`sp` → 诗篇，`mkfy` → 马可福音。

**排版**：经文按**自然段落连续流**呈现（不是一节一行的清单感），节号以小字上标嵌在句首，可关。当前节用**段内句子级点亮**，会众跟读时知道念到哪。

**投影交互**：纵向瀑布流滚动，拖动跟手带惯性；`PgUp/PgDn` 滚动一屏；`↑↓` 移动高亮且出屏自动跟随；底部细进度条淡显，静止 3 秒全隐。

**样式**：8 套预设主题（墨金、米白、深蓝、羊皮纸、深墨绿、炭灰金、雾白高对比、酒红金），字体四选（宋体子集/黑体子集/楷体/系统默认），可调字号、行距、字距、对齐、边距、节号显隐。背景可选内置纹理、自定义本地图片或纯色。**预览与投影同源渲染**，所见即所得。

**历史**：记录最近选过的经文，一键回到上次的位置。

---

## 快速开始

```bash
npm ci
npm run build        # 生成经文数据 → 编译主进程 → 构建渲染层 → 注入 CSP → 类型检查
npm start            # 启动 Electron
npm test             # 265 个测试
```

单独跑某一步：

```bash
npm run build:data     # SQLite → generated/bible.json
npm run build:main     # 主进程 TypeScript
npm run build:renderer # 两个渲染入口（vite）
npm run typecheck
npm run pack:win       # 打 Windows 三产物（NSIS / Portable / zip）
```

环境要求 Node ≥ 16.17。Windows 打包在 Linux 上交叉编译已完成验证。

---

## 数据从哪来

经文是 **和合本（CUV）简体**，源库 `data/cuv-simplified.db`（SQLite，随仓库提交），构建时由 `scripts/build-data.mjs` 转成 `generated/bible.json`。

`generated/` 是构建产物（已 gitignore），所以**克隆后必须跑一次 `npm run build:data`**，否则渲染层编译会失败。

数据边界很明确：

- 经文只在**构建期**进入，运行期不读数据库、不联网
- 打包产物用 `asar` 封装，但经文数据是渲染层 bundle 的一部分，不单独外置
- 和合本（1919 年）已进入公有领域

---

## 架构

```
主进程 (Electron main)
├── AppStateStore        唯一状态所有者：dispatch / getState / getHistory
│   ├── store.ts         状态归约与历史维护
│   └── persist-fs.ts    config.json / history.json 读写（读失败回落默认值）
├── 控制窗 control       window.bridge 经 preload 暴露
└── 投影窗 projection    按需创建；全屏到第二屏或本机浮动
```

关键约束：**状态只有一份，在主机进程里**。两个窗口都只是订阅者，通过 `dispatch(action)` 提交意图、通过 `onState` 接收新状态。这样预览和投影不可能出现不同步——它们读的是同一份状态，并共用同一个排版核 `shared/passage.ts`：`applyStageStyle()` 决定背景/字色，`buildPassage()` 负责字号、行距、字距、对齐、边距与节号，预览只是对同一结果施加 0.4 倍缩放。

```ts
interface BridgeApi {
  dispatch(action: Action): Promise<AppState>
  getState(): Promise<AppState>
  getHistory(): Promise<HistoryEntry[]>
  onState(cb: (state: AppState) => void): () => void
  onBanner(cb: (banner: { text: string | null }) => void): () => void
  sendScroll(direction: ScrollDirection): void
  onScroll(cb: (direction: ScrollDirection) => void): () => void
}
```

`registerIpc()` 的依赖通过注入传入（`IpcDeps`），测试里用假的 `ipcMain` 就能覆盖全部通道，不必启动 Electron。

### 目录

```
src/
├── main/          主进程：状态、窗口、持久化、IPC 注册
├── control/       控制窗 UI（原生 DOM，无框架）
├── projection/    投影窗渲染与滚动
└── shared/        两端共用：类型、搜索、样式、主题、排版、拼音
scripts/           构建期脚本：数据转换、图标、CSP 注入、产物投递
docs/              技术方案、ADR、工单、验收手册
data/              经文源库（SQLite）
generated/         构建产物（gitignore）
```

---

## 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 运行时 | Electron 22.3.27 | Chromium 108 是 Windows 7 SP1 能跑的最后一条线 |
| 渲染层 | 原生 DOM + TypeScript | 没有框架、没有虚拟 DOM，投影窗渲染开销可预测 |
| 运行期依赖 | **零** | 教会机器常年离线，任何一条依赖链都是风险 |
| 构建期依赖 | vite / electron-builder / better-sqlite3 | 只在开发机存在，不进产物 |
| 打包 | NSIS + Portable + zip | 教会机器可能禁止安装程序，Portable 是后路 |

Windows 7 兼容是硬约束，所以不能用新版 Electron、不能依赖新的 Web API、不能假设系统一定有某个字体（所以才做了字体子集）。

---

## 文档

| 文件 | 内容 |
|---|---|
| `docs/technical-plan.md` | 技术方案（架构、模块、验收标准） |
| `docs/design-v2-notes.md` | 交互模型重构的设计记录 |
| `docs/adr/` | 架构决策记录 |
| `docs/tickets/` | 工单：每张写清楚目标、范围、验收口径 |
| `docs/acceptance-checklist.md` | Windows 真机验收手册（家里段 / 教会段） |
| `RELEASE-NOTES.md` | 版本变更与安装说明 |

---

## 开发流程

本项目按 **spec → grill → tickets → implement/TDD** 推进：

1. 先写技术方案，明确验收口径
2. 出工单，每张工单自带测试要求
3. 开发按 TDD 实现，交付自测报告
4. PM **独立复验**——不采信"已完成"的自述，用自己的脚本连真实窗口取数据核对

第 4 步不是形式主义。此前多次出现开发自述"正常"、实测发现有内容被裁切或数据含水的情况，都是靠独立探测抓出来的。

---

## 已知限制

- **Windows 7 只是基线声明**，真机未验；首次发出的是 Win10/11 验证过的包
- 未做代码签名，首次运行会有 SmartScreen 提示（点「更多信息 → 仍要运行」）
- 接电视需用**扩展模式**（Win+P → 扩展），复制模式下去众看不到控制窗
- 单屏环境下投影是本机浮窗，不是真全屏

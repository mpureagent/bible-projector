# 圣言投屏（暂定名）技术方案

- 状态：草案 v1（待评审）
- 日期：2026-10-11
- 仓库：`bible-projector`
- 目标平台：离线 Windows（Win10 x64 基线，Win7 兼容包备选）

## 1. 背景与目标

教会讲道时需要把牧师引用的经文快速找出并投屏到电视。参考软件为「多功能圣经 4.055」（见需求配图），其信息架构高效但视觉陈旧。本产品目标：

- 保留参考软件的高效交互（书→章→节三级级联、分类着色书卷网格），视觉全面现代化、典雅化
- 双窗口：控制窗（操作员屏幕）+ 投影窗（电视/副屏全屏）
- 完全离线：圣经数据、字体、全部资源随包分发，运行期零网络请求
- 极简：只做查经、投屏、样式三件事；启动快、切换快、低配机可用

设计原则：三次点击内出经文；任何操作反馈 ≤100ms；界面无多余装饰，投影画面留白充足、字号巨大、远距离可读。

## 2. 需求与功能规格

### 2.1 查经（MVP）

| 功能 | 规格 |
|---|---|
| 旧/新约切换 | 双 Tab，切换后书卷网格即时刷新 |
| 书卷网格 | 按分类着色的按钮网格（分类见 5.2），显示简称；点击进章列表 |
| 章/节级联 | 章列 → 节列两列级联（参照配图），点击节即上屏 |
| 搜索框 | 支持：卷全名/简称/拼音首字母（如 `csj`→创世记）/经文关键字；结果下拉即时过滤（≤50ms） |
| 历史 | 最近 50 条选择记录（卷章+节范围），一键回跳；持久化保存 |

### 2.2 投影窗（MVP）

- 副屏全屏显示；单屏时 F11 全屏兜底；支持选择目标显示器
- 节号上标小字；当前节高亮色（与其余节区分）
- 段落合并模式（整章连续排版）/ 单节模式（一次一节超大字）
- 清屏（黑场，一键恢复）、锁屏（锁定投影内容防误触）
- 上移/下移（节/页翻页）、复制经文到剪贴板
- 显示格式：可隐藏节号、可隐藏书卷标题行

### 2.3 样式设置（MVP）

- 字体：内嵌子集化思源宋体（默认）+ 系统宋体/楷体/黑体可选
- 字号、字色、节号色、当前节高亮色
- 背景色 / 背景图（内置 3 张素雅纹理 + 自定义文件）
- 行距、字距、对齐方式、内容边距
- 预设主题 3 套（见 7.2），一键套用；所有设置实时同步投影窗并持久化

### 2.4 非功能指标

| 指标 | 目标 |
|---|---|
| 冷启动 | ≤2s（SSD）/ ≤3s（HDD） |
| 搜索/级联响应 | ≤50ms |
| 经文切换投影更新 | ≤100ms |
| 运行内存 | ≤300MB |
| 网络请求 | 0（CSP 强制） |
| 安装包体积 | ≤120MB（含字体） |

## 3. 技术选型

| 方案 | 多窗口/多屏 | 离线打包 | UI 表现力 | 结论 |
|---|---|---|---|---|
| **Electron + Vue3 + TS + Vite** | 成熟（BrowserWindow per display） | electron-builder 完善 | CSS 全自由 | **采用** |
| Tauri v2 | 支持 | 包体最小 | 好 | 否决：依赖 WebView2 运行时，无网老机缺失即不可用 |
| Flutter / Qt | 多窗口成本高 | 好 | 中 | 否决：富文本排版与双窗同步开发成本高 |
| WPF/.NET | 好 | 好 | 差（典雅 UI 成本大） | 否决 |

Electron 版本策略：基线用当前 LTS；若确认教会存在 Win7 机器，出 Electron 22（最后支持 Win7/8.1 的版本）兼容分支，功能集冻结在 MVP。

### 3.1 数据层决策

- 仓库内 `data/cuv-simplified.db`（SQLite，简体和合本神版，66 卷/1189 章/31103 节）为唯一数据源
- 构建期脚本转成静态 JSON（`generated/bible.json`，约 3–4MB），随 asar 分发
- 渲染进程启动时一次性载入内存并建索引；**不引入原生 SQLite 模块**（免 node-gyp 重编译、免架构问题）
- 经文关键字检索：31k 节全文约 100 万字符，JS 直接扫描 indexOf ≤20ms，无需倒排索引

### 3.2 窗口与状态同步

- main 进程为状态唯一持有者：`AppState = { selection, style, blank, lock, display }`
- 控制窗通过 IPC 发 action；main 更新状态后广播给投影窗（单向数据流，无竞态）
- 持久化：`userData/config.json`（样式）、`userData/history.json`（历史）
- 目标显示器以 `display.id` 持久化指派（不存 index——热插拔后 index 会漂移）

### 3.3 投影窗显示器热插拔状态机（ADR-0004）

现场事故场景：讲道中 HDMI 松动/电视切输入源 = 目标 display 消失、投影窗随之销毁或挂到未知屏。`windows.ts` 内维护一个三态状态机：

```
ASSIGNED ──display-removed──▶ FALLBACK ──display-added──▶ PENDING_RECONNECT ──重指派──▶ ASSIGNED
   ▲                              │                                    │
   └──────display-added（是原 id 或用户手动改选）──────────────────────┘
```

- **监听**：main 进程 `screen.on('display-removed')` / `screen.on('display-added')`（Electron 22 API，热插拔即触发）
- **FALLBACK**：目标 display 断开时，投影窗立即改挂主屏（控制窗所在显示器）并全屏置顶，画面内容不丢（`blank=false` 时经文继续显示）；控制窗顶栏亮出「⚠ 投影回退主屏」状态条
- **PENDING_RECONNECT / 恢复策略：自动重连**——`display-added` 事件里若新 display 的 `id` 等于持久化的目标 id（HDMI 重插通常同 id），立即把投影窗迁回该屏并退出 FALLBACK；id 不匹配（换了电视/投影仪）则停在 FALLBACK，由操作员在顶栏下拉里一键改选（一次点击，不做弹窗打断）
- **验收标准**：拔线—重插全流程投影窗不销毁、不白屏、经文内容不断档；换新显示器时一键改选后 ≤100ms 完成迁移

## 4. 系统架构与目录结构

```
bible-projector/
├─ data/cuv-simplified.db        # 唯一数据源（已入库）
├─ docs/technical-plan.md        # 本文件
├─ scripts/build-data.mjs        # SQLite → JSON 构建脚本（devDependency: better-sqlite3）
├─ generated/                    # 构建产物 bible.json（gitignore）
├─ assets/fonts/                 # 子集化思源宋体 woff2/ttf
├─ src/
│  ├─ main/                      # Electron 主进程
│  │  ├─ index.ts                # 入口、生命周期、单实例锁
│  │  ├─ windows.ts              # 控制窗/投影窗创建、显示器枚举与指派
│  │  ├─ store.ts                # AppState 中枢 + 持久化
│  │  └─ ipc.ts                  # IPC 通道契约（类型安全）
│  ├─ shared/
│  │  ├─ types.ts                # Book/Verse/AppState/Style 类型
│  │  └─ themes.ts               # 预设主题 token
│  ├─ control/                    # 控制窗渲染进程（Vue3 + Vite）
│  │  ├─ App.vue
│  │  ├─ views/PickerView.vue    # 搜索 + 书卷网格 + 章/节级联 + 历史
│  │  ├─ views/StylePanel.vue    # 样式抽屉
│  │  └─ components/             # BookGrid / ChapterColumn / VerseColumn / Toolbar
│  └─ projection/                 # 投影窗渲染进程（Vue3，纯展示）
│     └─ App.vue                 # 排版引擎：字号自适应/分页/高亮/黑场
└─ build/                        # electron-builder 配置（NSIS + portable）
```

## 5. 数据模型

### 5.1 源库 schema（已校验）

- `BibleID(SN, KindSN, ChapterNumber, NewOrOld, PinYin, ShortName, FullName)`：66 行
- `Bible(ID, VolumeSN, ChapterSN, VerseSN, Lection, ...)`：31103 行

### 5.2 分类与着色（KindSN）

| KindSN | 分类 | 卷数 | 网格色（低饱和） |
|---|---|---|---|
| 1 | 律法 | 5 | 暖沙 |
| 2 | 历史 | 12 | 雾蓝 |
| 3 | 诗歌智慧 | 5 | 藕紫 |
| 4 | 大先知 | 5 | 松绿 |
| 5 | 小先知 | 12 | 灰粉 |
| 6 | 福音+使徒 | 5 | 金黄 |
| 7 | 保罗书信 | 13 | 雾蓝 |
| 8 | 通用书信+启示 | 9 | 灰粉 |

### 5.3 构建产物结构

```json
{
  "books": [{ "sn": 43, "name": "约翰福音", "short": "约", "py": "YH", "cat": 6, "testament": 1, "chapters": 21 }],
  "verses": { "43": { "2": ["第三日，…", "…"] } }
}
```

## 6. 交互设计

### 6.1 主流程（三次点击出经文）

1. 点击书卷（或搜索框输入即过滤）→ 2. 点击章 → 3. 点击节（可 Shift 连选节范围）→ 投影窗立即上屏。

### 6.2 控制窗布局

- 左栏（固定 320px）：搜索框 + 旧/新/历史 Tab + 书卷网格
- 中栏：章/节级联列 + 经文预览（与投影同样式的小比例预览）
- 右抽屉：样式面板（默认收起，齿轮或 `S` 唤出）
- 顶栏：投屏显示器选择、黑场、锁屏、全屏、字号 ±（大按钮，≥40px 触区）

### 6.3 快捷键

| 键 | 动作 |
|---|---|
| ↑ / ↓ | 上一节 / 下一节 |
| PgUp / PgDn | 上一章 / 下一章 |
| B | 黑场切换 |
| L | 锁屏切换 |
| F | 投影全屏切换 |
| + / - | 投影字号增减 |
| S | 样式抽屉 |
| Esc | 退出黑场/全屏 |

## 7. 视觉设计

### 7.1 设计语言

- 控制窗：象牙白底（#F7F4EE）+ 墨色文字（#26221C）+ 金铜点缀（#A8863C）；细线分隔、圆角 6px、无重阴影
- 投影窗默认：深墨底（#101418）+ 暖金经文（#E8C87A），衬线大字、行距 1.7、边距 ≥8%
- 弃用参考图的 Win95 立体质感；保留其信息架构与分类着色思想（降饱和处理）

### 7.2 预设主题

| 名称 | 背景 | 经文 | 节号 |
|---|---|---|---|
| 墨金 | #101418 | #E8C87A | #8A7440 |
| 米白 | #F5F1E8 | #2A2622 | #8C8375 |
| 深蓝 | #0E1B2A | #F0E6D2 | #7E8CA0 |

### 7.3 字体方案

- 思源宋体（OFL 开源）用 fonttools 子集化至圣经字集（约 4500 字），woff2 ≤5MB 随包分发
- 回退链：内嵌思源宋体 → 系统宋体（simsun）→ serif

## 8. 性能方案

- 数据预载：启动即载入 JSON 建索引（主窗口显示前完成，splash 遮罩）
- 投影窗纯展示：无路由、无状态库，CSS transform 做翻页过渡（可关）
- 低配机开关：禁用动画、关闭 GPU 加速（设置项）
- 虚拟滚动不需要（单章 ≤176 节，直接渲染）

## 9. 离线与打包管线

- electron-builder 出 **NSIS 安装包 + 便携 exe** 双产物；全部资源入 asar
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`，运行期物理断网验收
- 字体、背景图随包；用户自定义背景图从本地文件读入（`userData` 缓存）
- 验收环境：离线 Windows 虚拟机（断网 + 双显示器模拟 + 2GB 内存低配模式）

### 9.1 Linux 交叉构建（spike 实证，ADR-0002）

开发机为 Linux，产物为 Windows 包。已用 spike（`/data/spikes/e22-cross-build/`，electron-builder 26.15.3 + Electron 22.3.27，配置结构同本节）实测交叉构建，结论：

| 目标 | 结果 | 证据（build log / dist 产物） |
|---|---|---|
| win-unpacked | 成功 | `packaging platform=win32 arch=x64 electron=22.3.27` → `downloaded electron zip extracted successfully`；dist/ 落盘 `ShengYanTouPing-Spike.exe` 157,602,304 字节 + 完整 Windows DLL 集（d3dcompiler_47.dll、libEGL.dll 等） |
| exe 资源改写/签名调用 | 成功 | `updating asar integrity executable resource executablePath=dist/win-unpacked/ShengYanTouPing-Spike.exe`；`signing with signtool.exe path=...`（主 exe 与 elevate.exe 各一次，无报错）——Linux 上无需 Windows 宿主 |
| zip | 成功 | build4.log TEST A `ZIP_EXIT=0`，耗时 1m13s；dist/ 落盘 93.7MB `*-0.1.0-win-x64.zip`（应急分发产物） |
| NSIS | **未完成** | 走到应用包压缩完成（下载 `nsis-3.0.4.1.7z`/`nsis-resources-3.4.1.7z`，产出 67MB `*-x64.nsis.7z`），最终链接失败：`⨯ wine process failed ENOENT`（exit 1）——**缺系统包 wine** |
| portable | **未跑完** | build4.log TEST B 停在 `signing with signtool.exe path=.../elevate.exe` 之后，无退出码、dist/ 无 `*-Portable-*.exe`（宿主机中断），不作"已验证"结论 |

**项目打包流程（固化）**：

1. 命令：`npx electron-builder --win --x64`（nsis + portable 双 target；配置沿用 spike 的 `build.win`/`build.nsis`/`build.portable` 结构，落 `package.json` `build` 字段与 `build/icon.ico`）
2. 本机依赖：Node、electron-builder 26.x、**wine64**（NSIS/portable 最终链接必需——spike 已实测缺它即失败）。补齐步骤：安装系统 wine（如 `dnf install wine`，64 位 ≥ wine 6），重跑上述命令出 `*-Setup-*.exe` 与 `*-Portable-*.exe`；此为 M4 前置项
3. 产物一律输出到 `/data` 路径下，**禁止在 /root / 系统盘建构建产物**（磁盘教训）
4. 产物校验：Setup exe 在断网 Win7 SP1 x64 VM 与 Win10 x64 VM 各安装一次、portable 免装直跑一次、双显示器环境跑全流程（spike 只验证"能构建"，产物尚未在任何 Windows 上运行过）

备选路径：若 wine 路径在脚本化后仍不稳定，切换 CI Windows runner 或 Windows 虚拟机内构建（ADR-0002 备选项），届时重开 ADR。

## 10. 里程碑（约 3 周）

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1（0.5 周） | 双窗口骨架、build-data 管线、store/持久化 | 双屏各显一窗，样式改动实时同步 |
| M2（1 周） | 查经级联、搜索四路匹配、历史 | 三次点击出经文；搜索 ≤50ms |
| M3（1 周） | 投影排版、样式面板、主题、快捷键 | 全部 2.2/2.3 功能可用 |
| M4（0.5 周） | 性能优化、打包、离线 VM 回归 | 2.4 指标全达标；断网全流程可用 |

开发流程使用项目内 skills：`ui-ux-pro-max`/`design-system`/`frontend-design` 出视觉与 token，`tdd` + `diagnosing-bugs` 保质量，`code-review` 收尾。

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 讲道中 HDMI 松动/电视切输入源（display 热插拔） | §3.3 状态机：display-removed 即回退主屏全屏，display-added 按 id 自动重连或一键改选（ADR-0004） |
| 教会存在 Win7 机器 | Electron 22 兼容分支，MVP 功能冻结 |
| CJK 字体体积/授权 | 思源宋体 OFL + 子集化 ≤5MB |
| 电视偏色/反光 | 高对比主题 + 字号上限 200px + 边距安全区 |
| 低配机卡顿 | 动画开关、GPU 开关、零依赖渲染路径 |
| 数据与纸质版出入 | cuvs 库已声明对照纸质和合本校订；M4 抽 100 节人工核对 |
| 单实例/多开冲突 | 主进程单实例锁，第二实例唤起首窗 |

## 12. 附录

- 数据源：github.com/izjr/cuvs（简体中文和合本·神版）
- 参考交互：多功能圣经 4.055 截图（需求配图）
- 项目 skills：`.qoder/skills/`（ui-ux-pro-max、design、design-system、ui-styling、frontend-design + Matt Pocock 稳定版 31 个）

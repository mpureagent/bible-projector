# 圣言投屏 v0.9.2

离线双窗圣经投屏：控制窗选经，电视/投影上屏。全程零联网。

> ⚠️ **本版为 v0.9.0 的交互模型重构版，投影交互不兼容 v0.9.0**。
> 旧版 v0.9.0-m4 已被本版取代（见 Release 页 SUPERSEDED 标注），请勿再分发旧包。
> **历史数据自动迁移**：首次启动会把 `%APPDATA%\bible-projector` 复制到 `%APPDATA%\圣言投屏`
> （配置/历史/Local Storage），旧目录改名 `bible-projector.migrated`，无需人工操作。

## 本版主要变化（R1–R8）

- **投屏模型**：投影窗默认不存在，点「投屏」才创建并上屏、点「取消投屏」销毁；
  有外接屏自动全屏到第二屏，单屏则为本机浮动窗「投影预览」（不吞主屏）；
  **删除黑场(B)/锁屏(L)**——临时藏内容直接「取消投屏」
- **选经**：四列一体级联弹窗（书 | 章 | 起始节 | 结束节），选完自动关窗；不跨章
- **排版**：经文按**自然段落连续流**（不再一节一行），节号上标嵌句首（默认显示、样式可关）；
  当前节=**段内句子级点亮**（会众跟读定位）
- **投影交互**：纵向瀑布流滚动；拖动=跟手+惯性缓停；`PgUp/PgDn`=滚动一屏；`↑↓`=移动高亮（出屏自动跟随）；
  底部细进度条（淡显、静止 3s 全隐）；废除水平翻页/分页引擎/单节模式
- **样式**：**8 套预设主题**（墨金·米白·深蓝·羊皮纸·深墨绿·炭灰金·雾白高对比·酒红金，默认墨金）；
  字体四选（宋体子集/黑体子集/楷体/系统默认）；字号/行距/字距/对齐(左·中)/边距/节号显隐；
  背景**三选一**（内置纹理·自定义图片·纯色，互斥）；预览与投影同源渲染（所见即所得）
- **窗口**：左栏搜索→旧/新约/历史 Tab→书卷每卷一行全名；操作条+预览取代底部状态条；预览文本可选中可复制
- **打包**：NSIS 默认安装目录钉 `C:\Program Files\圣言投屏`；userData 迁移圣言投屏目录

## 系统要求

- Windows 7 SP1 x64 或 Windows 10/11 x64（Electron 22 / Chromium 108 基线，ADR-0001）
- 接电视需**扩展模式**（Win+P → 扩展）；单屏亦可用（投影为本机浮动窗）
- 磁盘空间：安装约 200MB

## 三个安装产物（选其一）+ 效果图集

| 产物 | 用途 | 实测字节数 |
| --- | --- | --- |
| `bible-projector-Setup-0.9.2.exe` | 标准安装版（推荐） | 70,511,284（≈67.2MB ≤120MB 预算达标） |
| `bible-projector-Portable-0.9.2.exe` | 免安装单文件版 | 70,320,364 |
| `bible-projector-0.9.2-win-x64.zip` | 手动解包版（运行 `ShengYanProjector.exe`） | 96,983,234 |
| `theme-gallery-0.9.2.zip` | 8 套主题 1080p 效果图（约3:16-17 + 诗23:1-3，共 16 张） | 2,241,132 |

## 安装说明（Setup 版）

1. 建议用**管理员账号**运行（perMachine 全机安装）。
2. 安装向导默认目录 `C:\Program Files\圣言投屏`（见下「安装目录钉定」）。
3. 全程离线，不访问任何网络（构建侧审计：运行期外部请求数 = 0）。
4. 首次启动 Windows SmartScreen 可能提示「已保护你的电脑」——点「更多信息 → 仍要运行」
   （未代码签名，属正常；可右键 exe → 属性 → 勾「解除锁定」免除后续提示）。

## 安装目录钉定（R7a，如实记录）

- 实现：`build/installer.nsh` 的 `preInit` 宏在 NSIS `.onInit` 早期写入
  `${INSTALL_REGISTRY_KEY}` 的 `InstallLocation = $PROGRAMFILES64\圣言投屏`（`SetRegView 64`，HKLM+HKCU），
  覆盖并忽略旧卸载残留键。
- 证据（构建侧代码路径核对，本机为 Linux 构建主机）：
  - `app-builder-lib/templates/nsis/installer.nsi:55` `!ifmacrodef preInit` → `!insertmacro preInit`（.onInit 早期执行）
  - `app-builder-lib/templates/nsis/assistedInstaller.nsh:112/117` 随后 `ReadRegStr ... InstallLocation` 决定默认目录
  - `app-builder-lib/out/targets/nsis/NsisTarget.js:600` `packager.getResource(options.include)` → `scriptGenerator.include(...)`
  - 本次构建 `nsis.include=build/installer.nsh` 被接受、打包成功（EXIT=0）
- 残留验证项：安装器尚未在 Windows 真机执行一次（构建主机无 Windows）——请在真机首装时确认默认目录
  为 `C:\Program Files\圣言投屏`，如有偏差回传开修复票。

## 字体与字集（R5，如实声明）

- **宋体（子集）**：Noto Serif CJK SC 子集 → `bible-serif-sc.woff2`（591,392B，随包）
- **黑体（子集）**：本机 Noto Sans CJK SC 子集 → `bible-sans-sc.woff2`（468,944B，随包）
- **楷体：本机无楷体源文件，故不内嵌**——仅走系统回退链 `'楷体','KaiTi',serif`。
  Windows 自带楷体，离线成立。
- 字符集已涵盖全部经文 + 两窗全部 UI 文案与符号（含 × − ＋ ≥ 全角括号等），消除缺字豆腐块。

## 用户状态目录（R7b）

- 配置/历史/显示器指派存于 `%APPDATA%\圣言投屏`。
- 覆盖升级：首启自动迁移旧 `%APPDATA%\bible-projector`（失败不崩、回退并记警告控制台）。
- 卸载：安装目录与快捷方式由卸载器清除；用户状态目录**不随卸载删除**，需手动清理。

## 离线声明

- 经文、字体（Noto 子集，OFL 许可）、纹理全部内置。
- 渲染层启用 CSP（`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`）。
- 建议验收：安装 → 拔网线 → 全功能复验零联网。

## 已知边界（如实声明）

- **Win7 SP1 + Electron 22.3.27 从未在任何环境实测**——唯一未验证风险点；
  家里 Win10/11 通过 ≠ Win7 通过。教会终验第一件事就是 Win7 首装（见验收手册教会段置顶项）。
- 不买证书、不自签：SmartScreen 警告不可避免（未来公开发布再议）。
- 不支持：竖排、跨章选经、网络背景图。
- 性能数字（冷启动中位 852ms / PSS≈312MB）为 Linux 开发机参考值，非 Win7 HDD 承诺值。
- 楷体回退链与 NSIS 钉目录两项见上文「如实记录」段。

## 验收手册

见同 Release 附件 `acceptance-checklist.md`（家里段 + 教会段两清单）。
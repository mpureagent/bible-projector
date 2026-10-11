# 全平台单基线 Electron 22.3.x（不做 Win10 双分支）

需求方 2026-10-11 确认教会现场存在 Windows 7 SP1 机器，而 Electron 23 起不再支持 Win7/8/8.1。我们决定**所有平台统一使用 Electron 22.3.27**（Chromium 108.0.5359.215 / Node 16.17.1，22.x 最后一版，发布于 2023-10-09），不维护"Win10 用新 LTS + Win7 用 22"的双分支。本 app 只做查经/投屏/样式三件事，Chromium 108 的排版与多显示器能力完全够用；双分支意味着双倍打包线、双倍回归矩阵和长期同步成本，与"极简"原则直接冲突。

## Considered Options

- **单基线 22.3.x（采用）**：一条打包线、一份回归矩阵、一套 API 边界。
- **双分支（22 for Win7 + 当前 LTS for Win10）**：否决。产物、CI、测试矩阵翻倍，而本项目没有任何需要新 Chromium 的功能（无 WebGPU/无新编解码/无大内存需求）。
- **只支持 Win10+**：否决。需求方已确认 Win7 机器在场且短期不会换机，现场装不上等于产品不可用。
- **Tauri/WebView2**：已在方案 §3 否决（老机缺 WebView2 运行时且不能联网补装）。

## Consequences

- **Electron 22 已 EOL**（上游支持在 2023-10-10 结束，无安全更新）。接受该风险的前提是本产品的三条硬约束同时成立：运行期零网络请求（CSP 强制 + 物理断网验收）、装在教会管理员账号的专用机上、不承载任何用户敏感数据。**一旦未来引入任何联网功能（在线经文库、云同步、远程操作），必须立即重开本 ADR。**
- **主进程只能用 Node 16.17 的 API**：无内置 `fetch`、无 `structuredClone`、无 `node:test` 稳定接口。开发机 Node 版本（v26）与运行时不同，构建脚本可以用新 API，但 `src/main/**` 必须按 Node 16 语义写；`package.json` 里用 `engines.node: ">=16 <17"` 与 ESLint `n/no-unsupported-features/*`（按 node 16 设定）在提交前拦住。
- **渲染端 CSS 能力上限是 Chromium 108**：可用 `:has()`、容器查询；不可用 CSS 嵌套（112+）、`text-wrap: balance`（114+）、subgrid（117+）。视觉方案（§7）不得依赖 2023 年之后的新特性。
- **Vite 构建目标必须显式钉住** `build.target: 'chrome108'`，否则 esbuild 可能输出 Chromium 108 不认的语法，且失败发生在现场而不是开发机。
- 依赖升级不再是"跟最新"：任何 Electron/Chromium 升级都要先回答"Win7 还在不在场"。

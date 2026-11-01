# W1 验收报告（PM 独立实测）

日期：2026-11-01
工单：`docs/tickets/W1-web-host.md`
开发：Qoder（`deepseek-v4.1-flash-1017`，reasoning=high）
结论：**桌面端通过**；手机端不可用，已拆出 W2

> 本报告的每条数字都是 PM 自己跑出来的，未采信开发自测报告。

## 一、约束核对

| 约束 | 实测 |
|---|---|
| 运行期 `dependencies` 为空 | ✓ 仍为 `None` |
| 服务端只用 Node 内置模块 | ✓ `node:fs` / `node:http` / `node:path` |
| 现有 265 测试未改动 | ✓ 原测试文件零改动，34 文件 **292 用例全绿** |
| Electron 构建行为不变 | ✓ `dist/renderer/control/index.html` 仍含 1 处 CSP meta |
| 不写 `docs/acceptance/` 以外文件 | ✓ 仅 `W1-dev-selfreport.md` |

变更面：新增 7 个文件（`src/web/*` 3 个、两个 `web-boot.ts`、`vite.web.config.ts`、`tsconfig.web-server.json`），修改 4 个（`.gitignore`、`package.json`、`tsconfig.json`、`style-view.ts`）。`style-view.ts` 的改动是能力声明式（`window.hostCapabilities`，Electron 缺省=支持），未改变 Electron 行为。

## 二、安全实测（PM 主动攻击）

**路径穿越**——6 种变体全部拦住，无泄漏：

| 攻击串 | 响应 | 泄漏 |
|---|---|---|
| `/../package.json` | 404 | 0 |
| `/../../etc/passwd` | 404 | 0 |
| `/control/../../package.json` | 404 | 0 |
| `/%2e%2e/package.json` | 404 | 0 |
| `/control/%2e%2e/%2e%2e/package.json` | 404 | 0 |
| `/..%2fpackage.json` | 403 | 0 |

**错误处理**：非法 JSON → 400；空 body → 400；超 1MB → 413。

**监听范围**：仅 `127.0.0.1`，符合"本机验收、对外走隧道"的设计。

## 三、SSE 与状态同步

- 3 条并发 SSE 连接 → 全部收到 `event: state`（各 2 条：初始推送 + 变更广播）
- 连开 10 条再全部断开 → 服务存活，`/api/state` 仍返回 200（订阅者已清理）
- `POST /api/scroll` → 状态 MD5 前后一致，**确认只广播不改状态**
- 实时同步延迟：**45ms**（要求 ≤1000ms）
- **断线重连**：kill 服务 → 页面不刷新 → 重启 → 30ms 内自动重连并同步。达标。

## 四、浏览器实测（Chrome，PM 独立跑）

| 项 | 结果 |
|---|---|
| 控制窗加载 | bridge 就绪，66 卷书卷，搜索框在位 |
| 选经 → 预览 | 约翰福音 3:16-17 正确渲染，节号上标、当前节高亮框 |
| 主题切换 | 墨金 → 羊皮纸 → 深蓝，预览与投影同步变色 |
| 投屏 | 新标签打开投影页，内容与预览一致 |
| 投影窗复用 | 单控制窗下点一次 → `window.open` **仅 1 次**、**仅 1 个窗口** |
| 关闭后重开 | 手动关投影页 → 按钮自动复位「投屏」→ 再点可重新打开 |
| 滚动 | PgDn 每次精确滚 577px（= 视口高），瀑布流正常 |
| 纹理背景 | `../textures/rice-paper.svg` 解析为 `/textures/...`，图片真实加载成功 |
| 字体 | `Bible Serif SC` 状态 `loaded`；黑体子集 `unloaded`（按需加载，正常） |
| console 报错 | **0** |
| 横向溢出（桌面） | 0 |

### 一个曾误判为缺陷的现象

初次测试时一次点击开出 **2 个投影窗**，看似缺陷。追查发现是我自己的测试方法问题：此前多次 `new_tab('/control/')` 留下了**两个控制窗标签**，两个控制器各自执行 launch，各开一个。

只留一个控制窗后复测：`window.open` 调用 1 次、窗口 1 个。**非产品缺陷。**

（附带确认一个真实边界：同时开多个控制窗标签会各开一个投影窗。属可接受行为，不列入缺陷。）

## 五、手机端：不可用（转 W2）

390×844 视口实测：

```
clientWidth = 390
scrollWidth = 662      ← 横向溢出 272px
预览面板宽 290px，left=372，right=662  ← 完全出屏
```

没有任何响应式断点，左栏（372px）+ 右侧预览（290px）硬拼在一起。手机上只能看到书卷列表，**预览和操作条都在屏幕外**。

这与 hymn-manager 的 T10 是同一类问题，所以 W2 有现成解法可复用。

## 六、结论

**桌面端 Web 宿主可用**，功能、样式、同步、安全全部达标；Electron 路径零回归。

**手机端需 W2**，已附实测数据开工单。

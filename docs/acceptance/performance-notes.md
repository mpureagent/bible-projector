# 性能优化记录（W2 期间 PM 顺手修复）

日期：2026-11-01
触发：W2 验收后把 Web 端挂到公网隧道，发现**首次加载 27.8 秒**，用户无法验收。

## 问题一：服务端无压缩

**实测**：`scroll-*.js`（经文数据 + 代码）3,309,713 字节，隧道 119KB/s → **27.8 秒**。
`src/web/server.ts` 里没有任何 `Content-Encoding` 处理。

**修复**：静态文本资源（`.html/.js/.mjs/.css/.json/.map/.svg`）按 `Accept-Encoding` 走**流式 gzip**，压缩后 **1,164,154 字节（35.4%）**，同样条件 9.6 秒。

两个刻意选择：

1. **用 `createGzip()` 流式压缩，不用 `gzipSync()`**——同步压 3.3MB 会阻塞事件循环几百毫秒，期间 SSE 心跳和 `/api/action` 全部卡住。投影实时同步会因此抖动。
2. **只压文本，且跳过 <1KB 的文件**——woff2/png/jpg 本身已压缩，再压反而变大且白耗 CPU；小文件压缩收益抵不过头部开销。

响应头带 `Vary: Accept-Encoding`，避免中间缓存把压缩版发给不支持 gzip 的客户端。不支持 gzip 的客户端仍拿到原文（`Content-Length` 正确）。

## 问题二：字体每次访问都重下

**实测**：修完压缩后页面仍要 15 秒。用 `performance.getEntriesByType('resource')` 查明细，发现
`bible-serif-sc.woff2` **591KB，耗时 4.2 秒，且 `transferSize` 不为 0**——说明没走缓存。

根因：`cacheControl()` 只给 `/assets/` 下带 hash 的文件长缓存，其余一律 `no-cache`。字体在 `/fonts/` 下，于是**每次刷新都重新下载 578KB**。

**修复**：`/fonts/*.woff2` 给 `public, max-age=604800`（7 天）。不用 `immutable` 是因为字体文件名没有内容 hash，若字体更新需要能自然过期。

修完后实测：字体 `transferSize: 0`、`duration: 120ms`，**命中缓存**。

## 问题三：慢网首屏无反馈（感知优化）

**修复**：`index.html` 内联一个启动遮罩（「圣言投屏 / 正在加载经文数据…」），纯 HTML+CSS 不依赖 JS，因此能先于脚本渲染。

延迟 250ms 才淡入——本地与 Electron 秒开时用户看不到它，不会造成闪烁；慢网时才出现。`main.ts` 启动后将其移除。

## 最终实测（公网隧道，110~120KB/s）

| 场景 | 结果 |
|---|---|
| 首次访问（冷缓存） | 约 15 秒；期间显示启动遮罩 |
| 二次访问（热缓存） | **页面 load 事件 2.06s**，`domContentLoaded 1.89s`；JS 与字体 `transferSize` 全为 0 |

浏览器内部计时（`navigation` API）才是真相：`domContentLoaded 1887ms / loadEvent 2060ms`。

> 测量方法上的一个坑：用 CDP 轮询 `document.body.className` 判断"就绪"时，每次 `js()` 往返约 200ms，
> 120 次循环会把 2 秒的加载误测成 26 秒。**性能结论必须取 `performance` API 的内部计时，不能用轮询观感。**

## 仍未解决：首次加载 15 秒

压缩与缓存都做了，首次仍要 15 秒，因为**要传的字节就是这么多**：1.16MB 经文 bundle + 578KB 字体。

真正的解法是**按卷拆分经文数据**（66 卷，每卷 gzip 后约 15KB），首屏只取当前卷。但这需要把
`src/shared/bible.ts` 的同步 API 改成异步，影响 `renderProjection`、`preview-view`、`search` 等调用点，
属共享渲染核改动——已记录为候选工单 W3，等用户决定是否值得为验收体验付出这个复杂度。

考虑到：
- 验收场景下用户会反复打开同一链接，**二次访问只要 2 秒**
- 字体与 JS 都已缓存，日常使用快
- 生产部署（教会机器）是 Electron 本地读取，不受此影响

这个成本可能不值得付。但若用户觉得首次 15 秒仍不可接受，就做 W3。

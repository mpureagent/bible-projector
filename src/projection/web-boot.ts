import { createWebBridge } from '../web/bridge-client'

// W1：投影页 Web 引导——安装 window.bridge（与共享 main.ts 的 SSE 订阅共用一条连接）。

window.bridge = createWebBridge()
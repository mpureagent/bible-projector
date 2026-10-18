// T7-projection（R1 定稿）：ADR-0004 三态状态机与手动指派作废。
// 热插拔只剩两条兜底规则（纯函数，副作用以 Effect 数据返回）：
//   1. display-removed：拔掉的正是当前投屏目标 → 降级主屏（单屏即本机浮动窗）
//   2. display-added：插回的显示器 id 与记录的 display 一致 → 自动回连该屏
// display.id 仅作断开兜底参考（R1），无任何用户选择界面。

export type HotplugInput =
  | { kind: 'display-removed'; id: number }
  | { kind: 'display-added'; id: number }

export type HotplugEffect =
  | { type: 'fallback-to-primary' }
  | { type: 'move-to-display'; id: number }
  | { type: 'set-banner'; text: string | null }

export interface HotplugRules {
  handle(input: HotplugInput): HotplugEffect[]
}

export function createHotplugRules(getTargetId: () => number | null): HotplugRules {
  return {
    handle(input) {
      const targetId = getTargetId()
      switch (input.kind) {
        case 'display-removed':
          if (targetId !== null && input.id === targetId) {
            return [
              { type: 'fallback-to-primary' },
              { type: 'set-banner', text: '电视断开，投影已回退本机浮动窗' },
            ]
          }
          return []
        case 'display-added':
          if (targetId !== null && input.id === targetId) {
            return [
              { type: 'move-to-display', id: input.id },
              { type: 'set-banner', text: null },
            ]
          }
          return []
        default:
          return []
      }
    },
  }
}

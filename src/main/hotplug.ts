// §3.3 投影窗显示器热插拔三态状态机（纯函数，副作用以 Effect 数据返回）：
//
// ASSIGNED ──display-removed──▶ FALLBACK ──display-added──▶ PENDING_RECONNECT ──重指派──▶ ASSIGNED
//    ▲                              │                                    │
//    └──────display-added（是原 id 或用户手动改选）──────────────────────────────┘

export type HotplugStatus = 'ASSIGNED' | 'FALLBACK' | 'PENDING_RECONNECT'

export type HotplugInput =
  | { kind: 'display-removed'; id: number }
  | { kind: 'display-added'; id: number }
  | { kind: 'assign'; id: number }

export type HotplugEffect =
  | { type: 'fallback-to-primary' }
  | { type: 'move-to-display'; id: number }
  | { type: 'set-banner'; text: string | null }

export interface HotplugMachine {
  readonly status: HotplugStatus
  readonly targetId: number | null
  handle(input: HotplugInput): HotplugEffect[]
  subscribe(listener: (status: HotplugStatus) => void): () => void
}

export function createHotplugMachine(
  initialTarget: number | null,
  initialStatus: HotplugStatus = 'ASSIGNED',
): HotplugMachine {
  let status: HotplugStatus = initialTarget === null ? 'FALLBACK' : initialStatus
  let targetId = initialTarget
  const listeners = new Set<(status: HotplugStatus) => void>()

  return {
    get status() {
      return status
    },
    get targetId() {
      return targetId
    },
    handle(input) {
      const effects: HotplugEffect[] = []
      const before = status

      switch (input.kind) {
        case 'display-removed':
          if (status === 'ASSIGNED' && input.id === targetId) {
            status = 'FALLBACK'
            effects.push({ type: 'fallback-to-primary' })
            effects.push({ type: 'set-banner', text: '投影回退主屏' })
          }
          break
        case 'display-added':
          if (status === 'FALLBACK') {
            if (input.id === targetId) {
              toAssigned(input.id, effects)
            } else {
              status = 'PENDING_RECONNECT'
              effects.push({ type: 'set-banner', text: '检测到新显示器，请在顶栏选择' })
            }
          } else if (status === 'PENDING_RECONNECT' && input.id === targetId) {
            toAssigned(input.id, effects)
          }
          break
        case 'assign':
          toAssigned(input.id, effects)
          break
      }

      if (status !== before) {
        for (const listener of listeners) listener(status)
      }
      return effects

      function toAssigned(id: number, out: HotplugEffect[]): void {
        status = 'ASSIGNED'
        targetId = id
        out.push({ type: 'move-to-display', id })
        out.push({ type: 'set-banner', text: null })
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

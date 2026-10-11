import { describe, expect, it } from 'vitest'
import type { HotplugInput } from '../src/main/hotplug'
import { createHotplugMachine } from '../src/main/hotplug'

// §3.3 状态机：
// ASSIGNED ──display-removed──▶ FALLBACK ──display-added──▶ PENDING_RECONNECT ──重指派──▶ ASSIGNED
//    ▲                              │                                    │
//    └──────display-added（是原 id 或用户手动改选）──────────────────────────┘
describe('投影窗显示器热插拔状态机（§3.3 全部迁移路径）', () => {
  const removed = (id: number): HotplugInput => ({ kind: 'display-removed', id })
  const added = (id: number): HotplugInput => ({ kind: 'display-added', id })
  const assign = (id: number): HotplugInput => ({ kind: 'assign', id })

  it('ASSIGNED + 目标 display 移除 → FALLBACK（回退主屏 + 顶栏警示）', () => {
    const m = createHotplugMachine(101)
    const effects = m.handle(removed(101))
    expect(m.status).toBe('FALLBACK')
    expect(effects).toContainEqual({ type: 'fallback-to-primary' })
    expect(effects).toContainEqual({ type: 'set-banner', text: '投影回退主屏' })
  })

  it('ASSIGNED + 非 目标 display 移除 → 保持 ASSIGNED、零副作用', () => {
    const m = createHotplugMachine(101)
    expect(m.handle(removed(999))).toEqual([])
    expect(m.status).toBe('ASSIGNED')
  })

  it('FALLBACK + display-added（原 id）→ 直接恢复 ASSIGNED（HDMI 重插自动重连）', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    const effects = m.handle(added(101))
    expect(m.status).toBe('ASSIGNED')
    expect(effects).toContainEqual({ type: 'move-to-display', id: 101 })
    expect(effects).toContainEqual({ type: 'set-banner', text: null })
  })

  it('FALLBACK + display-added（新 id，换了电视）→ PENDING_RECONNECT（停在待改选）', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    m.handle(added(202))
    expect(m.status).toBe('PENDING_RECONNECT')
  })

  it('PENDING_RECONNECT + 用户一键改选 → ASSIGNED（重指派新目标并迁移）', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    m.handle(added(202))
    const effects = m.handle(assign(202))
    expect(m.status).toBe('ASSIGNED')
    expect(m.targetId).toBe(202)
    expect(effects).toContainEqual({ type: 'move-to-display', id: 202 })
    expect(effects).toContainEqual({ type: 'set-banner', text: null })
  })

  it('PENDING_RECONNECT + 原 display 重新出现 → 自动重连回 ASSIGNED', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    m.handle(added(202))
    const effects = m.handle(added(101))
    expect(m.status).toBe('ASSIGNED')
    expect(effects).toContainEqual({ type: 'move-to-display', id: 101 })
  })

  it('FALLBACK + 用户手动改选（bottom 回边）→ ASSIGNED', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    const effects = m.handle(assign(303))
    expect(m.status).toBe('ASSIGNED')
    expect(m.targetId).toBe(303)
    expect(effects).toContainEqual({ type: 'move-to-display', id: 303 })
  })

  it('ASSIGNED + 用户切换显示器（顶栏下拉）→ 更新目标并迁移', () => {
    const m = createHotplugMachine(101)
    const effects = m.handle(assign(202))
    expect(m.status).toBe('ASSIGNED')
    expect(m.targetId).toBe(202)
    expect(effects).toContainEqual({ type: 'move-to-display', id: 202 })
  })

  it('FALLBACK + 再移除非目标 display → 保持 FALLBACK', () => {
    const m = createHotplugMachine(101)
    m.handle(removed(101))
    expect(m.handle(removed(999))).toEqual([])
    expect(m.status).toBe('FALLBACK')
  })

  it('状态可订阅：迁移发生时通知监听者（控制窗顶栏状态条）', () => {
    const m = createHotplugMachine(101)
    const seen: string[] = []
    m.subscribe((s) => seen.push(s))
    m.handle(removed(101))
    m.handle(added(101))
    expect(seen).toEqual(['FALLBACK', 'ASSIGNED'])
  })
})

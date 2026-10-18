import { describe, expect, it } from 'vitest'
import { createHotplugRules } from '../src/main/hotplug'

// T7-projection（R1）：ADR-0004 三态状态机作废——热插拔只剩两条纯函数兜底规则：
//   display-removed 命中目标 → 降级主屏（fallback-to-primary + banner）
//   display-added 命中记录的 display.id → 自动回连（move-to-display + banner 清空）

const target = (id: number | null) => () => id

describe('T7-projection 热插拔兜底规则（R1）', () => {
  it('拔掉的是投屏目标 → 降级主屏 + banner 提示', () => {
    const rules = createHotplugRules(target(101))
    expect(rules.handle({ kind: 'display-removed', id: 101 })).toEqual([
      { type: 'fallback-to-primary' },
      { type: 'set-banner', text: '电视断开，投影已回退本机浮动窗' },
    ])
  })

  it('拔掉的是别的显示器 → 无副作用（投影不受影响）', () => {
    const rules = createHotplugRules(target(101))
    expect(rules.handle({ kind: 'display-removed', id: 999 })).toEqual([])
  })

  it('目标为 null（未记录 display.id）→ 拔线无兜底动作', () => {
    const rules = createHotplugRules(target(null))
    expect(rules.handle({ kind: 'display-removed', id: 101 })).toEqual([])
  })

  it('插回同一显示器 id → 自动回连该屏 + banner 清空', () => {
    const rules = createHotplugRules(target(101))
    expect(rules.handle({ kind: 'display-added', id: 101 })).toEqual([
      { type: 'move-to-display', id: 101 },
      { type: 'set-banner', text: null },
    ])
  })

  it('插入的是别的显示器 → 不自动指派（R1：无选择界面、不抢屏）', () => {
    const rules = createHotplugRules(target(101))
    expect(rules.handle({ kind: 'display-added', id: 999 })).toEqual([])
  })

  it('目标为 null → 插线不自动上屏', () => {
    const rules = createHotplugRules(target(null))
    expect(rules.handle({ kind: 'display-added', id: 101 })).toEqual([])
  })

  it('目标 id 可随 store 变化（getTargetId 实时读取）', () => {
    let current: number | null = 101
    const rules = createHotplugRules(() => current)
    expect(rules.handle({ kind: 'display-removed', id: 101 })).not.toEqual([])
    current = 202
    expect(rules.handle({ kind: 'display-removed', id: 101 })).toEqual([])
    expect(rules.handle({ kind: 'display-removed', id: 202 })).not.toEqual([])
  })

  it('降级后 display.id 记录保留（作为插回时自动回连的参考，R1）', () => {
    const rules = createHotplugRules(target(101))
    rules.handle({ kind: 'display-removed', id: 101 })
    // rules 无内部状态：display.id 由外部 store 持有，回连判定继续以 101 为准
    expect(rules.handle({ kind: 'display-added', id: 101 })).toEqual([
      { type: 'move-to-display', id: 101 },
      { type: 'set-banner', text: null },
    ])
  })

  it('三态状态机不存在：HotplugStatus/PENDING_RECONNECT 等机器语义已删除', async () => {
    const mod = await import('../src/main/hotplug')
    expect('createHotplugMachine' in mod).toBe(false)
    expect('HotplugMachine' in mod).toBe(false)
  })

  it('不存在 assign 输入（手动指派作废，R1）', () => {
    const rules = createHotplugRules(target(101))
    // @ts-expect-error assign 已从 HotplugInput 类型删除
    expect(rules.handle({ kind: 'assign', id: 101 })).toEqual([])
  })
})

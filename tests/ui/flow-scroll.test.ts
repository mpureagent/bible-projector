// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  decayVelocity,
  followScrollTop,
  IDLE_MS,
  INERTIA_DECAY,
  ProgressVisibility,
  progressRatio,
  scrollByScreen,
  ScrollController,
  SETTLE_VELOCITY,
  shouldShow,
} from '../../src/projection/scroll'

// T7-flow（R4）：纵向滚动内核——一屏滚动、高亮跟随、进度条显隐状态机、拖动惯性参数边界。

function scrollEl(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  return el
}

describe('T7-flow 一屏滚动（PgUp/PgDn）', () => {
  it('向下滚动一屏、向上回滚、两端钳制', () => {
    expect(scrollByScreen(0, 400, 'down', 1000)).toBe(400)
    expect(scrollByScreen(400, 400, 'up', 1000)).toBe(0)
    expect(scrollByScreen(0, 400, 'up', 1000)).toBe(0)
    expect(scrollByScreen(900, 400, 'down', 1000)).toBe(1000)
  })
})

describe('T7-flow 高亮出屏自动跟随（↑↓）', () => {
  it('节在视口内 → null（不动）；在上方 → 顶对齐；在下方 → 底对齐', () => {
    expect(followScrollTop(100, 400, 200, 60)).toBeNull() // 200..260 在 100..500 内
    expect(followScrollTop(100, 400, 40, 60)).toBe(40) // 出上方 → 滚到 elemTop
    expect(followScrollTop(0, 400, 380, 60)).toBe(40) // 440 > 400 → 底对齐 = 440-400
    expect(followScrollTop(0, 400, -500, 60)).toBe(0) // 越界不产生负值
  })
})

describe('T7-flow 进度条显隐状态机（淡显 30% → 静止 3s 全隐）', () => {
  it('activity → 显示；idle 未到 → 保持；到点 → 全隐', () => {
    const bar = document.createElement('div')
    const vis = new ProgressVisibility(bar, IDLE_MS)
    expect(vis.isVisible()).toBe(false)
    vis.activity(1000)
    expect(vis.isVisible()).toBe(true)
    expect(bar.classList.contains('visible')).toBe(true)
    vis.tick(1000 + IDLE_MS - 1)
    expect(vis.isVisible()).toBe(true)
    vis.tick(1000 + IDLE_MS)
    expect(vis.isVisible()).toBe(false)
    expect(bar.classList.contains('visible')).toBe(false)
  })

  it('shouldShow 边界：严格小于 idleMs', () => {
    expect(shouldShow(0, IDLE_MS - 1, IDLE_MS)).toBe(true)
    expect(shouldShow(0, IDLE_MS, IDLE_MS)).toBe(false)
  })

  it('progressRatio：顶 0 / 底 1 / 无溢出 0 / 越界钳制', () => {
    expect(progressRatio(0, 1000, 400)).toBe(0)
    expect(progressRatio(600, 1000, 400)).toBe(1)
    expect(progressRatio(0, 400, 400)).toBe(0)
    expect(progressRatio(9999, 1000, 400)).toBe(1)
    expect(progressRatio(-50, 1000, 400)).toBe(0)
  })
})

describe('T7-flow 拖动惯性参数边界', () => {
  it('速度按帧衰减，低于 settle 阈值归零（0<decay<1）', () => {
    expect(INERTIA_DECAY).toBeGreaterThan(0)
    expect(INERTIA_DECAY).toBeLessThan(1)
    expect(SETTLE_VELOCITY).toBeGreaterThan(0)
    expect(decayVelocity(10)).toBeCloseTo(10 * INERTIA_DECAY, 5)
    expect(decayVelocity(SETTLE_VELOCITY / 2)).toBe(0)
    expect(decayVelocity(-SETTLE_VELOCITY / 2)).toBe(0)
  })

  it('惯性单调衰减：连续多帧后必收敛到 0', () => {
    let v = 100
    let frames = 0
    while (v !== 0 && frames < 1000) {
      v = decayVelocity(v)
      frames++
    }
    expect(v).toBe(0)
    expect(frames).toBeLessThan(1000)
  })
})

describe('T7-flow ScrollController（滚动容器 + 进度条）', () => {
  it('scrollByScreen 改变 scrollTop；scroll 事件唤起进度条', () => {
    const el = scrollEl(1000, 300)
    const bar = document.createElement('div')
    const ctrl = new ScrollController(el, bar, { screenHeight: () => 300 })
    expect(ctrl.progressVisible()).toBe(false)
    ctrl.scrollByScreen('down')
    expect(el.scrollTop).toBe(300)
    expect(ctrl.progressVisible()).toBe(true)
    ctrl.destroy()
  })

  it('destroy 后不再响应滚动（监听已解绑）', () => {
    const el = scrollEl(1000, 300)
    const bar = document.createElement('div')
    const ctrl = new ScrollController(el, bar, { screenHeight: () => 300 })
    ctrl.destroy()
    el.dispatchEvent(new Event('scroll'))
    expect(ctrl.progressVisible()).toBe(false)
  })
})
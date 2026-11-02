// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCROLL_SETTLE_MS, ScrollController } from '../../src/projection/scroll'

// W3：滚动取节只在真正停下时结算——rAF 合并 + 防抖，不允许每帧派发；
// 拖动延后到松手，拖动完的 click 不算点击。

function scrollEl(scrollHeight = 4000, clientHeight = 300): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  return el
}

// 帧调度注入为 0ms 定时器，便于 fake timers 精确推进
const rafSoon = (callback: FrameRequestCallback): number => {
  setTimeout(() => callback(Date.now()), 0)
  return 1
}

afterEach(() => {
  vi.useRealTimers()
})

describe('W3 滚动停止判定（连续滚动不每帧派发）', () => {
  it('100 个 scroll 事件只结算 1 次（rAF 合并 + 防抖）', async () => {
    vi.useFakeTimers()
    const el = scrollEl()
    const settled = vi.fn()
    const ctrl = new ScrollController(el, null, {
      screenHeight: () => 300,
      onScrollSettled: settled,
      raf: rafSoon,
    })
    for (let i = 0; i < 100; i++) el.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS + 20)
    expect(settled).toHaveBeenCalledTimes(1)
    ctrl.destroy()
  })

  it('连续滚动 2 秒：派发次数远小于帧数（实测值写日志）', async () => {
    vi.useFakeTimers()
    const el = scrollEl()
    const settled = vi.fn()
    const ctrl = new ScrollController(el, null, {
      screenHeight: () => 300,
      onScrollSettled: settled,
      raf: rafSoon,
    })
    let events = 0
    for (let t = 0; t < 2000; t += 16) {
      el.dispatchEvent(new Event('scroll'))
      events++
      await vi.advanceTimersByTimeAsync(16)
    }
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS + 20)
    console.log(`[W3] ${events} scroll events / 2000ms → ${settled.mock.calls.length} settle dispatch`)
    expect(settled.mock.calls.length).toBeLessThanOrEqual(1)
    ctrl.destroy()
  })

  it('拖动中不结算，松手后只结算一次', async () => {
    vi.useFakeTimers()
    const el = scrollEl()
    const settled = vi.fn()
    const ctrl = new ScrollController(el, null, {
      screenHeight: () => 300,
      onScrollSettled: settled,
      raf: rafSoon,
    })
    el.dispatchEvent(new MouseEvent('pointerdown', { clientY: 200, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientY: 150, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientY: 200, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientY: 200, bubbles: true }))
    el.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS + 50)
    expect(settled).not.toHaveBeenCalled()

    el.dispatchEvent(new MouseEvent('pointerup', { clientY: 200, bubbles: true }))
    expect(settled).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS + 50)
    expect(settled).toHaveBeenCalledTimes(1)
    ctrl.destroy()
  })

  it('拖动超过阈值后抑制随后的 click', () => {
    const el = scrollEl()
    const ctrl = new ScrollController(el, null, { screenHeight: () => 300 })
    el.dispatchEvent(new MouseEvent('pointerdown', { clientY: 200, clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientY: 150, clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientY: 200, clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointerup', { clientY: 200, clientX: 10, bubbles: true }))
    expect(ctrl.consumeClickSuppressed()).toBe(true)
    expect(ctrl.consumeClickSuppressed()).toBe(false)
    ctrl.destroy()
  })
})
import { VERSE_ATTR } from '../shared/passage'
import type { ScrollDirection } from '../shared/types'

// T7-flow（R2/R4）：纵向瀑布流滚动与手势——纯函数 + 轻量控制器。
// 拖动=跟手+惯性缓停；PgUp/PgDn=一屏；↑↓ 高亮出屏自动跟随；
// 底部细进度条：无箭头无页数，淡显 30% 透明，静止 3s 全隐，滚动/翻页重现。

export const IDLE_MS = 3000 // 静止多久进度条全隐
export const INERTIA_DECAY = 0.94 // 每帧速度衰减
export const SETTLE_VELOCITY = 0.2 // 速度低于此值即停（px/帧）
export const SCROLL_SETTLE_MS = 120 // 滚动停止判定（最后一帧后再等这么久）
export const CLICK_DRAG_THRESHOLD = 6 // 拖动超过此距离不再视为点击

export function progressRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, scrollTop / max))
}

export function shouldShow(lastActivityAt: number, now: number, idleMs = IDLE_MS): boolean {
  return now - lastActivityAt < idleMs
}

// PgUp/PgDn 一屏（含两端钳制）
export function scrollByScreen(
  scrollTop: number,
  screenHeight: number,
  direction: ScrollDirection,
  max: number,
): number {
  const delta = direction === 'down' ? screenHeight : -screenHeight
  return Math.min(Math.max(0, max), Math.max(0, scrollTop + delta))
}

// ↑↓ 高亮移动后：若当前节已出视口则返回新 scrollTop（使其可见），否则 null（不动）
export function followScrollTop(
  scrollTop: number,
  clientHeight: number,
  elemTop: number,
  elemHeight: number,
): number | null {
  const elemBottom = elemTop + elemHeight
  const viewBottom = scrollTop + clientHeight
  if (elemTop < scrollTop) return Math.max(0, elemTop)
  if (elemBottom > viewBottom) return Math.max(0, elemBottom - clientHeight)
  return null
}

// W3 滚动取节（用户已定）：屏幕顶部第一行——视口顶边往下第一个与视口相交的 [data-verse]。
// 纯函数便于单测；DOM 顺序即阅读顺序。
export interface VerseRect {
  verse: number
  top: number
  bottom: number
}

export function pickTopVerse(rects: readonly VerseRect[], viewportTop: number): number | null {
  for (const rect of rects) {
    if (rect.bottom > viewportTop) return rect.verse
  }
  return null
}

export function verseAtTop(scrollEl: HTMLElement): number | null {
  const viewportTop = scrollEl.getBoundingClientRect().top
  const rects: VerseRect[] = []
  for (const el of scrollEl.querySelectorAll<HTMLElement>(`[${VERSE_ATTR}]`)) {
    const rect = el.getBoundingClientRect()
    rects.push({ verse: Number(el.getAttribute(VERSE_ATTR)), top: rect.top, bottom: rect.bottom })
  }
  return pickTopVerse(rects, viewportTop)
}

export function decayVelocity(velocity: number, decay = INERTIA_DECAY): number {
  const next = velocity * decay
  return Math.abs(next) < SETTLE_VELOCITY ? 0 : next
}

// 进度条显隐状态机（可注入时钟，便于单测）
export class ProgressVisibility {
  private lastActivityAt = Number.NEGATIVE_INFINITY
  private visible = false

  constructor(private readonly el: HTMLElement, private readonly idleMs = IDLE_MS) {}

  activity(now: number): void {
    this.lastActivityAt = now
    this.set(true)
  }

  tick(now: number): void {
    if (this.visible && !shouldShow(this.lastActivityAt, now, this.idleMs)) this.set(false)
  }

  isVisible(): boolean {
    return this.visible
  }

  private set(value: boolean): void {
    this.visible = value
    this.el.classList.toggle('visible', value)
  }
}

export interface ScrollControllerOptions {
  screenHeight(): number
  idleMs?: number
  now?(): number
  /** W3：滚动真正停下（含拖动松手、惯性结束）后回调一次 */
  onScrollSettled?(): void
  /** 停止判定时长（默认 SCROLL_SETTLE_MS） */
  settleMs?: number
  /** 可注入的帧调度（单测用） */
  raf?(callback: FrameRequestCallback): number
}

// 绑定一个滚动容器（投影 stage 或控制窗预览）+ 底部进度条
export class ScrollController {
  private readonly progress: ProgressVisibility
  private dragging = false
  private lastY = 0
  private velocity = 0
  private inertiaRaf: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly settleMs: number
  private readonly frameRequest: (callback: FrameRequestCallback) => number
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private scrollFramePending = false
  private frameToken = 0
  private destroyed = false
  private pointerStartX = 0
  private pointerStartY = 0
  private moved = false
  private suppressClick = false

  constructor(
    private readonly scrollEl: HTMLElement,
    barEl: HTMLElement | null,
    private readonly options: ScrollControllerOptions,
  ) {
    this.progress = new ProgressVisibility(barEl ?? document.createElement('div'), options.idleMs ?? IDLE_MS)
    this.settleMs = options.settleMs ?? SCROLL_SETTLE_MS
    this.frameRequest =
      options.raf ??
      ((callback) =>
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(callback)
          : (setTimeout(() => callback(Date.now()), 16) as unknown as number))
    this.scrollEl.addEventListener('scroll', this.onScroll)
    this.scrollEl.addEventListener('pointerdown', this.onPointerDown)
    this.scrollEl.addEventListener('pointermove', this.onPointerMove)
    this.scrollEl.addEventListener('pointerup', this.onPointerUp)
    this.scrollEl.addEventListener('pointerleave', this.onPointerUp)
    const now = options.now ?? (() => Date.now())
    this.timer = setInterval(() => this.progress.tick(now()), 250)
  }

  private onScroll = (): void => {
    this.markActivity()
    this.updateBar()
    this.requestSettleFrame()
  }

  private markActivity(): void {
    const now = (this.options.now ?? Date.now)()
    this.progress.activity(now)
    this.updateBar()
  }

  private updateBar(): void {
    // 进度条位置由 CSS 变量驱动（thumb 宽度/偏移），无箭头无页数
    const el = this.progress
    void el
    const ratio = progressRatio(this.scrollEl.scrollTop, this.scrollEl.scrollHeight, this.scrollEl.clientHeight)
    document.documentElement.style.setProperty('--scroll-ratio', String(ratio))
  }

  // W3：滚动事件用 rAF 合并到每帧一次，再进入防抖；高亮只在真正停下时更新
  private requestSettleFrame(): void {
    if (!this.options.onScrollSettled || this.scrollFramePending) return
    this.scrollFramePending = true
    const token = ++this.frameToken
    this.frameRequest(() => {
      if (token !== this.frameToken || this.destroyed) return
      this.scrollFramePending = false
      this.scheduleSettle()
    })
  }

  private scheduleSettle(): void {
    if (!this.options.onScrollSettled || this.destroyed) return
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      if (this.destroyed) return
      // 拖动中延后到松手；惯性未停不反复派发
      if (this.dragging || this.inertiaRaf !== null) return
      this.options.onScrollSettled?.()
    }, this.settleMs)
  }

  // 强制结算（松手无惯性 / 惯性结束）：作废本帧待执行的回调，只派发一次
  private flushSettle(): void {
    this.frameToken++
    this.scrollFramePending = false
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    if (!this.options.onScrollSettled || this.destroyed) return
    if (this.dragging || this.inertiaRaf !== null) return
    this.options.onScrollSettled()
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.dragging = true
    this.lastY = event.clientY
    this.pointerStartX = event.clientX
    this.pointerStartY = event.clientY
    this.moved = false
    this.velocity = 0
    this.stopInertia()
    this.markActivity()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return
    if (
      Math.abs(event.clientX - this.pointerStartX) > CLICK_DRAG_THRESHOLD ||
      Math.abs(event.clientY - this.pointerStartY) > CLICK_DRAG_THRESHOLD
    ) {
      this.moved = true
    }
    const dy = this.lastY - event.clientY
    this.lastY = event.clientY
    this.velocity = dy
    this.scrollEl.scrollTop += dy
    this.markActivity()
  }

  private onPointerUp = (): void => {
    if (!this.dragging) return
    this.dragging = false
    const moved = this.moved
    if (moved) this.suppressClick = true
    this.startInertia()
    // 纯轻点没有发生滚动，不做"滚动停下"取节（否则会先闪到顶部节再执行点击）
    if (moved && this.inertiaRaf === null) this.flushSettle()
  }

  // 拖动松手后的点击不算点击（避免拖完误点亮）
  consumeClickSuppressed(): boolean {
    const value = this.suppressClick
    this.suppressClick = false
    return value
  }

  private startInertia(): void {
    const step = (): void => {
      this.velocity = decayVelocity(this.velocity)
      if (this.velocity === 0) {
        this.inertiaRaf = null
        this.flushSettle()
        return
      }
      this.scrollEl.scrollTop += this.velocity
      this.markActivity()
      this.inertiaRaf = requestAnimationFrame(step)
    }
    if (this.velocity !== 0) this.inertiaRaf = requestAnimationFrame(step)
  }

  private stopInertia(): void {
    if (this.inertiaRaf !== null) {
      cancelAnimationFrame(this.inertiaRaf)
      this.inertiaRaf = null
    }
  }

  scrollByScreen(direction: ScrollDirection): void {
    const max = Math.max(0, this.scrollEl.scrollHeight - this.scrollEl.clientHeight)
    this.scrollEl.scrollTop = scrollByScreen(
      this.scrollEl.scrollTop,
      this.options.screenHeight(),
      direction,
      max,
    )
    this.markActivity()
    this.requestSettleFrame()
  }

  // ↑↓ 高亮移动后：出屏才跟随；返回是否真的滚动了（调用方据此抑制滚动取节）
  followVerse(verse: number): boolean {
    const target = this.scrollEl.querySelector<HTMLElement>(`[${VERSE_ATTR}="${verse}"]`)
    if (!target) return false
    const next = followScrollTop(this.scrollEl.scrollTop, this.scrollEl.clientHeight, target.offsetTop, target.offsetHeight)
    if (next === null) return false
    this.scrollEl.scrollTop = next
    this.markActivity()
    this.requestSettleFrame()
    return true
  }

  isDragging(): boolean {
    return this.dragging
  }

  progressVisible(): boolean {
    return this.progress.isVisible()
  }

  activity(): void {
    this.markActivity()
  }

  destroy(): void {
    this.destroyed = true
    this.frameToken++
    this.stopInertia()
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    if (this.timer !== null) clearInterval(this.timer)
    this.scrollEl.removeEventListener('scroll', this.onScroll)
    this.scrollEl.removeEventListener('pointerdown', this.onPointerDown)
    this.scrollEl.removeEventListener('pointermove', this.onPointerMove)
    this.scrollEl.removeEventListener('pointerup', this.onPointerUp)
    this.scrollEl.removeEventListener('pointerleave', this.onPointerUp)
  }
}
import { VERSE_ATTR } from '../shared/passage'
import type { ScrollDirection } from '../shared/types'

// T7-flow（R2/R4）：纵向瀑布流滚动与手势——纯函数 + 轻量控制器。
// 拖动=跟手+惯性缓停；PgUp/PgDn=一屏；↑↓ 高亮出屏自动跟随；
// 底部细进度条：无箭头无页数，淡显 30% 透明，静止 3s 全隐，滚动/翻页重现。

export const IDLE_MS = 3000 // 静止多久进度条全隐
export const INERTIA_DECAY = 0.94 // 每帧速度衰减
export const SETTLE_VELOCITY = 0.2 // 速度低于此值即停（px/帧）

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
}

// 绑定一个滚动容器（投影 stage 或控制窗预览）+ 底部进度条
export class ScrollController {
  private readonly progress: ProgressVisibility
  private dragging = false
  private lastY = 0
  private velocity = 0
  private raf: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly scrollEl: HTMLElement,
    barEl: HTMLElement | null,
    private readonly options: ScrollControllerOptions,
  ) {
    this.progress = new ProgressVisibility(barEl ?? document.createElement('div'), options.idleMs ?? IDLE_MS)
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

  private onPointerDown = (event: PointerEvent): void => {
    this.dragging = true
    this.lastY = event.clientY
    this.velocity = 0
    this.stopInertia()
    this.markActivity()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return
    const dy = this.lastY - event.clientY
    this.lastY = event.clientY
    this.velocity = dy
    this.scrollEl.scrollTop += dy
    this.markActivity()
  }

  private onPointerUp = (): void => {
    if (!this.dragging) return
    this.dragging = false
    this.startInertia()
  }

  private startInertia(): void {
    const step = (): void => {
      this.velocity = decayVelocity(this.velocity)
      if (this.velocity === 0) {
        this.raf = null
        return
      }
      this.scrollEl.scrollTop += this.velocity
      this.markActivity()
      this.raf = requestAnimationFrame(step)
    }
    if (this.velocity !== 0) this.raf = requestAnimationFrame(step)
  }

  private stopInertia(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
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
  }

  // ↑↓ 高亮移动后：出屏才跟随
  followVerse(verse: number): void {
    const target = this.scrollEl.querySelector<HTMLElement>(`[${VERSE_ATTR}="${verse}"]`)
    if (!target) return
    const next = followScrollTop(this.scrollEl.scrollTop, this.scrollEl.clientHeight, target.offsetTop, target.offsetHeight)
    if (next !== null) {
      this.scrollEl.scrollTop = next
      this.markActivity()
    }
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
    this.stopInertia()
    if (this.timer !== null) clearInterval(this.timer)
    this.scrollEl.removeEventListener('scroll', this.onScroll)
    this.scrollEl.removeEventListener('pointerdown', this.onPointerDown)
    this.scrollEl.removeEventListener('pointermove', this.onPointerMove)
    this.scrollEl.removeEventListener('pointerup', this.onPointerUp)
    this.scrollEl.removeEventListener('pointerleave', this.onPointerUp)
  }
}
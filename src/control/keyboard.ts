import { mapKey } from '../shared/keymap'
import type { Action, AppState } from '../shared/types'

// 控制窗键盘控制器（§6.3 / T7 R1）——mapKey 意图分发到 dispatch/抽屉。
// Esc 语义链：抽屉开 → 关抽屉；投屏中 → 退投屏；其余无动作；永不退出程序。
// 输入控件聚焦时不劫持按键（抽屉路径输入等）。

export interface KeyboardControllerDeps {
  getState(): AppState | null
  dispatch(action: Action): void
  isDrawerOpen(): boolean
  closeDrawer(): void
  toggleDrawer(): void
}

const EDITABLE = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

export function createKeyboardController(deps: KeyboardControllerDeps): { dispose(): void } {
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as Element | null
    if (target && EDITABLE.has(target.tagName)) return
    if (event.key === 'Escape' && deps.isDrawerOpen()) {
      event.preventDefault()
      deps.closeDrawer()
      return
    }
    const state = deps.getState()
    if (!state) return
    const intent = mapKey(event.key, state)
    if (intent === null) return
    event.preventDefault()
    switch (intent.kind) {
      case 'action':
        deps.dispatch(intent.action)
        break
      case 'toggle-drawer':
        deps.toggleDrawer()
        break
    }
  }
  document.addEventListener('keydown', onKeyDown)
  return { dispose: () => document.removeEventListener('keydown', onKeyDown) }
}

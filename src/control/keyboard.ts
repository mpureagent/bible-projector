import { mapKey } from '../shared/keymap'
import type { Action, AppState } from '../shared/types'

// T4-keys：控制窗键盘控制器（§6.3）——mapKey 意图分发到 dispatch/抽屉/投影全屏。
// 输入控件聚焦时不劫持按键（抽屉路径输入等）。

export interface KeyboardControllerDeps {
  getState(): AppState | null
  dispatch(action: Action): void
  toggleDrawer(): void
  setFullscreen(value?: boolean): void
}

const EDITABLE = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

export function createKeyboardController(deps: KeyboardControllerDeps): { dispose(): void } {
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as Element | null
    if (target && EDITABLE.has(target.tagName)) return
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
      case 'toggle-fullscreen':
        deps.setFullscreen(undefined)
        break
      case 'exit-fullscreen':
        deps.setFullscreen(false)
        break
    }
  }
  document.addEventListener('keydown', onKeyDown)
  return { dispose: () => document.removeEventListener('keydown', onKeyDown) }
}

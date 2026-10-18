import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_USER_DATA_DIR_NAME,
  MIGRATED_SUFFIX,
  migrateLegacyUserData,
  USER_DATA_DIR_NAME,
  userDataDir,
} from '../src/main/userdata'

// T7-package（R7b）：userData 迁移——临时目录模拟 %APPDATA% 下新旧两路径

const created: string[] = []
function appData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sy-appdata-'))
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('T7-package userData 目录命名（R7b）', () => {
  it('新目录 = <appData>/圣言投屏；旧目录名 bible-projector', () => {
    const base = appData()
    expect(userDataDir(base)).toBe(join(base, USER_DATA_DIR_NAME))
    expect(USER_DATA_DIR_NAME).toBe('圣言投屏')
    expect(LEGACY_USER_DATA_DIR_NAME).toBe('bible-projector')
  })
})

describe('T7-package 首启迁移（R7b）', () => {
  it('无旧目录 → no-legacy，不创建新目录', () => {
    const base = appData()
    const result = migrateLegacyUserData(base, () => {})
    expect(result.status).toBe('no-legacy')
    expect(existsSync(userDataDir(base))).toBe(false)
  })

  it('旧目录存在 → 复制 config/history 到新目录，旧目录改名 .migrated', () => {
    const base = appData()
    const legacy = join(base, LEGACY_USER_DATA_DIR_NAME)
    mkdirSync(join(legacy, 'Local Storage'), { recursive: true })
    writeFileSync(join(legacy, 'config.json'), JSON.stringify({ style: { theme: 'ivory' } }))
    writeFileSync(join(legacy, 'history.json'), JSON.stringify([{ sn: 1 }]))
    writeFileSync(join(legacy, 'Local Storage', 'x.bin'), 'blob')

    const result = migrateLegacyUserData(base, () => {})
    expect(result.status).toBe('migrated')
    const target = userDataDir(base)
    expect(existsSync(join(target, 'config.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(target, 'config.json'), 'utf-8'))).toEqual({ style: { theme: 'ivory' } })
    expect(existsSync(join(target, 'history.json'))).toBe(true)
    expect(existsSync(join(target, 'Local Storage', 'x.bin'))).toBe(true)
    // 旧目录已改名标记
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(`${legacy}${MIGRATED_SUFFIX}`)).toBe(true)
  })

  it('新目录已有内容 → target-exists，不覆盖（避免二次迁移覆盖新数据）', () => {
    const base = appData()
    const legacy = join(base, LEGACY_USER_DATA_DIR_NAME)
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'config.json'), 'OLD')
    const target = userDataDir(base)
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'config.json'), 'NEW')

    const result = migrateLegacyUserData(base, () => {})
    expect(result.status).toBe('target-exists')
    expect(readFileSync(join(target, 'config.json'), 'utf-8')).toBe('NEW')
    expect(existsSync(legacy)).toBe(true)
  })

  it('复制失败 → failed，console.warn 告警、不抛出、旧目录保留（不崩）', () => {
    const base = appData()
    const legacy = join(base, LEGACY_USER_DATA_DIR_NAME)
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'config.json'), 'OLD')
    // 目标路径是一个文件（非目录）→ cpSync 递归复制必失败
    writeFileSync(userDataDir(base), 'I am a file, not a dir')

    const warn = vi.fn()
    const result = migrateLegacyUserData(base, warn)
    expect(result.status).toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(result.error).toBeTruthy()
    // 旧目录仍在（未被改名，数据保留）
    expect(existsSync(legacy)).toBe(true)
    expect(existsSync(`${legacy}${MIGRATED_SUFFIX}`)).toBe(false)
  })
})
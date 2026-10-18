import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

// T7-package（R7b）：userData 目录与首启迁移。
// 新目录 %APPDATA%\圣言投屏；旧版 %APPDATA%\bible-projector 首启复制迁移，
// 成功后旧目录改名 .migrated；失败不崩、回退并 console 警告（如实纪律）。

export const USER_DATA_DIR_NAME = '圣言投屏'
export const LEGACY_USER_DATA_DIR_NAME = 'bible-projector'
export const MIGRATED_SUFFIX = '.migrated'

export function userDataDir(appDataDir: string): string {
  return join(appDataDir, USER_DATA_DIR_NAME)
}

export type MigrationStatus = 'migrated' | 'no-legacy' | 'target-exists' | 'failed'

export interface MigrationResult {
  status: MigrationStatus
  legacyDir: string
  targetDir: string
  error?: string
}

function isEmptyDir(path: string): boolean {
  try {
    return readdirSync(path).length === 0
  } catch {
    return true
  }
}

// 递归复制目录（Node 16 基线：cpSync 尚为实验特性，避免依赖；逐层 mkdir + copyFile）
function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dst, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (entry.isFile()) copyFileSync(from, to)
  }
}

// 首启迁移：复制旧 userData（config/history/Local Storage 等全量）→ 新目录；成功后旧目录改名 .migrated。
// 失败路径：记录警告并返回 failed，绝不抛出（启动不因迁移失败而崩）。
export function migrateLegacyUserData(
  appDataDir: string,
  warn: (message: string) => void = console.warn,
): MigrationResult {
  const targetDir = userDataDir(appDataDir)
  const legacyDir = join(appDataDir, LEGACY_USER_DATA_DIR_NAME)

  if (!existsSync(legacyDir)) return { status: 'no-legacy', legacyDir, targetDir }
  // 新目录已有内容则不覆盖（避免二次启动重复迁移/覆盖新数据）
  if (existsSync(targetDir) && !isEmptyDir(targetDir)) return { status: 'target-exists', legacyDir, targetDir }

  try {
    copyDir(legacyDir, targetDir)
    renameSync(legacyDir, `${legacyDir}${MIGRATED_SUFFIX}`)
    return { status: 'migrated', legacyDir, targetDir }
  } catch (error) {
    warn(`[userdata] 旧数据迁移失败，回退旧路径：${(error as Error).message}`)
    return { status: 'failed', legacyDir, targetDir, error: (error as Error).message }
  }
}
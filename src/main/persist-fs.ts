import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { HistoryEntry, ProjectionStyle } from '../shared/types'
import type { PersistedConfig, Persistence } from './store'

// userData/config.json（样式）+ userData/history.json（历史）持久化（§3.2）

export function fsPersistence(userDataDir: string): Persistence {
  const configPath = join(userDataDir, 'config.json')
  const historyPath = join(userDataDir, 'history.json')

  function readJson<T>(path: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as T
    } catch {
      return fallback
    }
  }

  function writeJson(path: string, value: unknown): void {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(path, JSON.stringify(value), 'utf-8')
  }

  return {
    loadConfig() {
      return readJson<{ style?: Partial<ProjectionStyle>; display?: number | null }>(configPath, {})
    },
    saveConfig(config: PersistedConfig) {
      writeJson(configPath, config)
    },
    loadHistory() {
      return readJson<HistoryEntry[]>(historyPath, [])
    },
    saveHistory(history: HistoryEntry[]) {
      writeJson(historyPath, history)
    },
  }
}

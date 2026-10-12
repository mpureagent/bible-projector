#!/usr/bin/env node
// T5-audit 运行器：Xvfb 下以 Linux electron 跑 dist 版（票面声明的代理性验证），
// NODE_OPTIONS=--require 注入 scripts/audit-hook.cjs；冷启动×3 取中位数；
// 进程树 RSS 峰值采样。输出写入 .artifacts/audit-offline.log。

import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LOG = resolve(ROOT, '.artifacts/audit-offline.log')
mkdirSync(resolve(ROOT, '.artifacts'), { recursive: true })
appendFileSync(LOG, `\n=== audit-offline run at ${new Date().toISOString()} ===\n`)

const DISPLAY = ':96'
// 清理上次残留的 X 会话，避免端口占用导致 electron 挂起
for (const pattern of [`Xvfb ${DISPLAY}`, 'xfwm4']) {
  try {
    execFileSync('pkill', ['-f', pattern])
  } catch {
    // 无残留
  }
}

const XDG_CONFIG = resolve(ROOT, '.artifacts/electron-userdata')
const XDG_CACHE = resolve(ROOT, '.artifacts/electron-cache')
mkdirSync(XDG_CONFIG, { recursive: true })
mkdirSync(XDG_CACHE, { recursive: true })

const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1920x1080x24'], {
  detached: true,
  stdio: 'ignore',
})
xvfb.unref()
await new Promise((r) => setTimeout(r, 1500))

// 进程树内存采样：RSS（含共享页跨进程重复计入）与 PSS（按比例分摊，更接近真实占用）
function pssKb(pid) {
  try {
    const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf-8')
    const m = rollup.match(/^Pss:\s+(\d+)\s+kB/m)
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

function treeMemoryKb(rootPid) {
  const out = execFileSync('ps', ['-eo', 'pid,ppid,rss'], { encoding: 'utf-8' })
  const rows = out
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number))
  const children = new Map()
  for (const [pid, ppid, rss] of rows) {
    if (!children.has(ppid)) children.set(ppid, [])
    children.get(ppid).push([pid, rss])
  }
  let rss = 0
  let pss = 0
  const stack = [rootPid]
  const seen = new Set()
  while (stack.length) {
    const pid = stack.pop()
    if (seen.has(pid)) continue
    seen.add(pid)
    for (const [child, childRss] of children.get(pid) ?? []) {
      rss += childRss
      pss += pssKb(child)
      stack.push(child)
    }
  }
  return { rss, pss }
}

const runs = []
for (let i = 1; i <= 3; i++) {
  const child = spawn(
    resolve(ROOT, 'node_modules/.bin/electron'),
    [ROOT, '--no-sandbox', '--disable-gpu'],
    {
      env: {
        ...process.env,
        DISPLAY,
        XDG_CONFIG_HOME: XDG_CONFIG,
        XDG_CACHE_HOME: XDG_CACHE,
        NODE_OPTIONS: `--require=${resolve(ROOT, 'scripts/audit-hook.cjs')}`,
        AUDIT_RUN: String(i),
        AUDIT_DRIVE: i === 1 ? '1' : '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => (stderr += d))
  let peakRssKb = 0
  let peakPssKb = 0
  const sampler = setInterval(() => {
    try {
      const { rss, pss } = treeMemoryKb(child.pid)
      peakRssKb = Math.max(peakRssKb, rss)
      peakPssKb = Math.max(peakPssKb, pss)
    } catch {
      // ps 采样的瞬时竞态可容忍
    }
  }, 250)
  const code = await new Promise((r) => child.on('exit', r))
  clearInterval(sampler)
  const reportLine = stdout.split('\n').find((l) => l.startsWith('[audit] report='))
  const coldLine = stdout.split('\n').find((l) => l.includes('main-window-interactive-ms='))
  const parsed = reportLine ? JSON.parse(reportLine.slice('[audit] report='.length)) : null
  runs.push({
    run: i,
    exit: code,
    peakRssKb,
    peakPssKb,
    coldStartMs: parsed?.coldStartMs ?? (coldLine ? Number(coldLine.split('=').pop()) : null),
    counters: parsed?.counters ?? null,
    externalUrls: parsed?.externalUrls ?? [],
    cspViolations: parsed?.cspViolations ?? [],
  })
  appendFileSync(LOG, stdout + (stderr ? `\n[stderr]\n${stderr.slice(0, 2000)}` : '') + '\n')
}

const colds = runs.map((r) => r.coldStartMs).filter((v) => typeof v === 'number').sort((a, b) => a - b)
const medianCold = colds.length ? colds[Math.floor(colds.length / 2)] : null
const summary = {
  proxyDeclaration: 'Linux electron 对 dist 版的代理性验证；真机 Windows 断网复验归用户 M4 验收',
  runs,
  externalUrlsAll: runs.flatMap((r) => r.externalUrls),
  cspViolationsAll: runs.flatMap((r) => r.cspViolations),
  externalRequestsTotal: runs.reduce((a, r) => a + (r.counters?.external ?? 0), 0),
  coldStartMedianMs: medianCold,
  coldStartRunsMs: colds,
  peakRssKb: Math.max(...runs.map((r) => r.peakRssKb)),
  peakPssKb: Math.max(...runs.map((r) => r.peakPssKb ?? 0)),
  exitCodes: runs.map((r) => r.exit),
}
appendFileSync(LOG, `[audit] summary=${JSON.stringify(summary)}\n`)
console.log(`[audit] summary=${JSON.stringify(summary, null, 2)}`)
try {
  process.kill(-xvfb.pid, 'SIGTERM')
} catch {
  // Xvfb 已退出则忽略
}

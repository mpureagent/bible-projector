#!/usr/bin/env bash
# T7-release（R8）：验收 E2E 截图 ≥4——级联弹窗 / 投屏前无劫持 / 投屏中 / 米白主题预览。
# Xvfb 单次启动，逐场景跑 Electron 后 capturePage 落图（control 必存，projection 存在才存）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.artifacts/e2e"
mkdir -p "$OUT"
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export XDG_CONFIG_HOME="$ROOT/.artifacts/e2e-userdata"
mkdir -p "$XDG_CONFIG_HOME"

Xvfb :98 -screen 0 1920x1080x24 >/dev/null 2>&1 &
XPID=$!
trap 'kill $XPID 2>/dev/null || true' EXIT
sleep 1

shot() {
  local name="$1"
  cp "$ROOT/.artifacts/xvfb-control.png" "$OUT/${name}-control.png"
  [ -f "$ROOT/.artifacts/xvfb-projection.png" ] && cp "$ROOT/.artifacts/xvfb-projection.png" "$OUT/${name}-projection.png" || true
  echo "e2e: $name"
}

# 每场景前清掉上一轮残留（否则无投影窗场景会误拷上一张投影图）
clean() { rm -f "$ROOT/.artifacts/xvfb-control.png" "$ROOT/.artifacts/xvfb-projection.png"; }

clean
DISPLAY=:98 SMOKE_CAPTURE=1 SMOKE_HOLD_MS=0 SMOKE_CASCADE=1 \
  "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu > "$ROOT/.artifacts/e2e.log" 2>&1 || true
shot 1-cascade-open

clean
DISPLAY=:98 SMOKE_CAPTURE=1 SMOKE_HOLD_MS=0 SMOKE_NO_PROJECT=1 SMOKE_SELECT=gen-1-1 \
  "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu > "$ROOT/.artifacts/e2e.log" 2>&1 || true
shot 2-pre-project-no-takeover

clean
DISPLAY=:98 SMOKE_CAPTURE=1 SMOKE_HOLD_MS=0 SMOKE_SELECT=gen-1-1 \
  "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu > "$ROOT/.artifacts/e2e.log" 2>&1 || true
shot 3-projecting

clean
DISPLAY=:98 SMOKE_CAPTURE=1 SMOKE_HOLD_MS=0 SMOKE_SELECT=ps-23-1 SMOKE_STYLE=theme:ivory \
  "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu > "$ROOT/.artifacts/e2e.log" 2>&1 || true
shot 4-ivory-preview

echo "e2e dir: $OUT"
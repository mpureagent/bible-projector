#!/usr/bin/env bash
# T4 E2E：Xvfb + xfwm4 双窗同框根截图（沿用 .artifacts 约定；userData 走 XDG_CONFIG_HOME，不写 /root）。
# 用法：./scripts/e2e-root-shot.sh <输出名.png> [SMOKE_SELECT=… SMOKE_STYLE=… 等env…]
set -euo pipefail
NAME="$1"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export XDG_CONFIG_HOME="$ROOT/.artifacts/electron-userdata"
mkdir -p "$XDG_CONFIG_HOME" "$ROOT/.artifacts"

Xvfb :95 -screen 0 1920x1080x24 >/dev/null 2>&1 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true' EXIT
sleep 1
DISPLAY=:95 xfwm4 --replace >/dev/null 2>&1 &
sleep 1

DISPLAY=:95 env "$@" SMOKE_CAPTURE=1 SMOKE_HOLD_MS=8000 \
  "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu \
  > "$ROOT/.artifacts/smoke.log" 2>&1 &
ELECTRON_PID=$!
sleep 6
DISPLAY=:95 ffmpeg -y \
  -f x11grab -video_size 1920x1080 -i :95 -frames:v 1 "$ROOT/.artifacts/$NAME" >/dev/null 2>&1
wait $ELECTRON_PID || true
echo "shot: $ROOT/.artifacts/$NAME"
grep "\[smoke\]" "$ROOT/.artifacts/smoke.log" || true

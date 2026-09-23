#!/usr/bin/env bash
# 개인용 Sugo Dashboard: SQLite + local login + Sugo Agent 연결을 한 번에 준비한다.
set -euo pipefail

DASHBOARD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$DASHBOARD_ROOT/backend"
FRONTEND_DIR="$DASHBOARD_ROOT/frontend"
SECRET_FILE="$BACKEND_DIR/.local-session-secret"

info() { printf '\033[36m[local]\033[0m %s\n' "$1"; }
ok() { printf '\033[32m[local]\033[0m %s\n' "$1"; }
die() { printf '\033[31m[local]\033[0m %s\n' "$1" >&2; exit 1; }

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0
  return 1
}

wait_port() {
  local port="$1" label="$2" waited=0
  while [ "$waited" -lt 60 ]; do
    if port_open "$port"; then ok "$label 준비됨 (:$port)"; return 0; fi
    sleep 1
    waited=$((waited + 1))
  done
  die "$label 이(가) :$port 에서 시작되지 않았습니다."
}

next_free_port() {
  local port="$1"
  while port_open "$port"; do port=$((port + 1)); done
  printf '%s' "$port"
}

for project_dir in "$BACKEND_DIR" "$FRONTEND_DIR"; do
  if [ ! -d "$project_dir/node_modules" ]; then
    info "의존성 설치: $project_dir"
    (cd "$project_dir" && npm_config_cache="${TMPDIR:-/tmp}/sugo-dashboard-npm-cache" npm ci)
  fi
done

if [ ! -f "$SECRET_FILE" ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
fi

API_PORT="$(next_free_port "${DASHBOARD_API_PORT:-3001}")"
UI_PORT="$(next_free_port "${DASHBOARD_UI_PORT:-5173}")"

export HOST="127.0.0.1"
export PORT="$API_PORT"
export DB_DRIVER="sqlite"
export SQLITE_FILE="${SQLITE_FILE:-$BACKEND_DIR/local.db}"
export SESSION_SECRET="$(cat "$SECRET_FILE")"
export LOCAL_DEV_MODE="1"
export LOCAL_DEV_USER_ID="${LOCAL_DEV_USER_ID:-$(id -un)}"
export LOCAL_DEV_DISPLAY_NAME="${LOCAL_DEV_DISPLAY_NAME:-Local Developer}"
export FRONTEND_URL="http://localhost:$UI_PORT"
export CORS_ORIGINS="http://localhost:$UI_PORT"
export SUGO_DASHBOARD_API_URL="http://localhost:$API_PORT"
export HARNESS_PATH="${HARNESS_PATH:-$DASHBOARD_ROOT/../sugo/harness-library}"
export SKILLS_PATH="${SKILLS_PATH:-$DASHBOARD_ROOT/../sugo}"

info "SQLite와 Sugo Agent 연결 초기화"
(cd "$BACKEND_DIR" && npx tsx local-setup.mts)
# SUGO_DASHBOARD_API_URL 환경변수를 쓰면 Agent 설정 해석도 환경변수 모드가 되므로,
# 같은 프로세스의 초기 동기화에는 API token도 함께 전달해야 한다.
export SUGO_DASHBOARD_API_TOKEN="$(node -e 'const fs=require("fs");const os=require("os");const p=process.env.SUGO_SETTINGS_FILE||`${process.env.SUGO_HOME_OVERRIDE||os.homedir()}/.claude/sugo/settings.json`;const s=JSON.parse(fs.readFileSync(p,"utf8"));process.stdout.write(s.dashboard.apiToken)')"

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

info "Dashboard API 시작"
(cd "$BACKEND_DIR" && npm run dev) & pids+=("$!")
info "Dashboard UI 시작"
(cd "$FRONTEND_DIR" && VITE_API_BASE="http://localhost:$API_PORT" VITE_LOCAL_DEV=true npm run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort) & pids+=("$!")

wait_port "$API_PORT" "Dashboard API"
wait_port "$UI_PORT" "Dashboard UI"

info "기존 ~/.claude/sugo 워크스페이스·작업·roadmap 동기화"
(cd "$BACKEND_DIR" && npx tsx local-sync.mts)
if [ "${SUGO_LOCAL_DEMO:-1}" != "0" ]; then
  info "UI 전체 시나리오용 tmp-sugo-showcase 데이터 준비"
  (cd "$BACKEND_DIR" && npx tsx local-demo.mts)
fi

LOGIN_URL="http://localhost:$API_PORT/api/auth/local"
ok "Sugo Agent → http://localhost:$API_PORT 연결 완료"
ok "Dashboard → http://localhost:$UI_PORT"
if command -v open >/dev/null 2>&1; then open "$LOGIN_URL" >/dev/null 2>&1 || true; fi
printf '\n브라우저가 열리지 않으면 아래 주소를 여세요.\n  %s\n\nCtrl+C로 종료합니다. SQLite 데이터는 %s 에 유지됩니다.\n' "$LOGIN_URL" "$SQLITE_FILE"
wait

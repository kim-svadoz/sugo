#!/usr/bin/env bash
# `sd`: 기존 개인용 Sugo Dashboard를 정리하고 최신 소스로 백그라운드 재시작한다.
set -euo pipefail

SOURCE_PATH="${BASH_SOURCE[0]}"
while [ -L "$SOURCE_PATH" ]; do
  SOURCE_DIR="$(cd "$(dirname "$SOURCE_PATH")" && pwd)"
  SOURCE_PATH="$(readlink "$SOURCE_PATH")"
  case "$SOURCE_PATH" in /*) ;; *) SOURCE_PATH="$SOURCE_DIR/$SOURCE_PATH" ;; esac
done
DASHBOARD_ROOT="$(cd "$(dirname "$SOURCE_PATH")" && pwd)"
source "$DASHBOARD_ROOT/port-contract.sh"
BACKEND_DIR="$DASHBOARD_ROOT/backend"
FRONTEND_DIR="$DASHBOARD_ROOT/frontend"
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
STATE_DIR="${SUGO_DASHBOARD_STATE_DIR:-$TEMP_ROOT/sugo-dashboard-${UID}}"
PID_FILE="$STATE_DIR/supervisor.pid"
LOG_FILE="$STATE_DIR/dashboard.log"
LAUNCH_LABEL="com.sugo.dashboard.local"
API_PORT="$SUGO_LOCAL_API_PORT"
UI_PORT="$SUGO_LOCAL_UI_PORT"

if [ "${1:-}" = "ports" ]; then
  sugo_print_port_contract
  exit 0
fi
if [ "$#" -gt 0 ]; then
  printf '사용법: sd [ports]\n' >&2
  exit 2
fi

mkdir -p "$STATE_DIR"

stop_previous() {
  if command -v launchctl >/dev/null 2>&1; then
    launchctl remove "$LAUNCH_LABEL" >/dev/null 2>&1 || true
  fi
  if [ ! -f "$PID_FILE" ]; then return; fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
  fi
  rm -f "$PID_FILE"
}

# 플러그인이 세션 시작 때 띄우는 번들 대시보드가 같은 API 포트를 쓴다. 개발 서버가 대신 뜨도록 먼저 멈춘다.
# PID는 다른 프로세스가 물려받을 수 있어서, 기록된 포트가 대시보드 health에 응답할 때만 종료한다.
stop_bundled_dashboard() {
  local state_file="$HOME/.claude/sugo/dashboard/server.json" pid
  [ -f "$state_file" ] || return 0
  pid="$(sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' "$state_file" | head -n 1)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 0
  curl -fsS --max-time 2 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 || return 0
  kill "$pid" 2>/dev/null || true
  for _ in {1..30}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
}

# 예전 실행기는 PID 파일이 없고 빈 포트를 찾아 계속 복제됐다. 알려진 개발 포트의 listener 중
# cwd가 이 dashboard의 backend/frontend인 프로세스만 정리해 다른 로컬 앱은 건드리지 않는다.
stop_stale_dashboard_listeners() {
  command -v lsof >/dev/null 2>&1 || return
  local pid cwd
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    case "$cwd" in
      "$BACKEND_DIR"|"$FRONTEND_DIR") kill "$pid" 2>/dev/null || true ;;
    esac
  done < <(
    {
      lsof -tiTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null || true
      lsof -tiTCP:"$UI_PORT" -sTCP:LISTEN 2>/dev/null || true
    } | sort -u
  )
}

# 직전 프로세스가 죽는 것과 OS가 포트를 실제로 회수하는 건 별개 타이밍이다. 고정 sleep은
# 느린 종료(진행 중 요청 처리 등)일 때 --strictPort 재기동과 레이스를 일으킨다 — 포트가
# 실제로 비는 것을 최대 5초까지 폴링하고, 그래도 안 비면(다른 프로세스가 점유 등) 밑에서
# 어차피 --strictPort가 명확한 에러로 실패하게 둔다.
wait_ports_free() {
  command -v lsof >/dev/null 2>&1 || return 0
  local waited=0
  while [ "$waited" -lt 50 ]; do
    if ! lsof -tiTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1 && ! lsof -tiTCP:"$UI_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  return 0
}

stop_previous
stop_bundled_dashboard
stop_stale_dashboard_listeners
wait_ports_free
sugo_require_port_free "$API_PORT" "Sugo Dashboard API"
sugo_require_port_free "$UI_PORT" "Sugo Dashboard UI"

: > "$LOG_FILE"
run_mode="nohup"
supervisor_pid=""
if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  run_mode="launchctl"
  launchctl submit -l "$LAUNCH_LABEL" -o "$LOG_FILE" -e "$LOG_FILE" -- \
    /usr/bin/env PATH="$PATH" DASHBOARD_API_PORT="$API_PORT" DASHBOARD_UI_PORT="$UI_PORT" \
    "$DASHBOARD_ROOT/dev-local.sh"
else
  nohup env DASHBOARD_API_PORT="$API_PORT" DASHBOARD_UI_PORT="$UI_PORT" \
    "$DASHBOARD_ROOT/dev-local.sh" >"$LOG_FILE" 2>&1 </dev/null &
  supervisor_pid=$!
  printf '%s\n' "$supervisor_pid" > "$PID_FILE"
fi

service_alive() {
  if [ "$run_mode" = "launchctl" ]; then
    launchctl print "gui/${UID}/${LAUNCH_LABEL}" >/dev/null 2>&1
  else
    kill -0 "$supervisor_pid" 2>/dev/null
  fi
}

for _ in {1..120}; do
  if grep -q "Dashboard →" "$LOG_FILE"; then
    url="$(sed -n 's/.*Dashboard → //p' "$LOG_FILE" | tail -n 1)"
    printf 'Sugo Dashboard 재시작 완료: %s\n' "${url:-http://localhost:$UI_PORT}"
    printf '로그: %s\n' "$LOG_FILE"
    exit 0
  fi
  if ! service_alive; then
    printf 'Sugo Dashboard 시작 실패. 로그: %s\n' "$LOG_FILE" >&2
    tail -n 30 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 0.25
done

printf 'Sugo Dashboard가 제한 시간 안에 준비되지 않았습니다. 로그: %s\n' "$LOG_FILE" >&2
exit 1

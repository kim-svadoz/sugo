#!/usr/bin/env bash
# Sugo Dashboard 로컬 확인 (실제 MySQL) — dev-mysql.ps1의 POSIX(mac/리눅스) 대응판.
#
#   cd ~/sugo/dashboard && ./dev-mysql.sh
#   → http://localhost:4173/dev-login.html
#
# 하는 일: MySQL 기동 확인 → E2E API/UI 고정 포트 → 시드 + dev-login.html.
#
# ⚠️ 순서가 중요하다: `vite build`가 dist/를 비우면서 dev-login.html까지 지운다.
#    반드시 **빌드 → 시드** 순서여야 한다. 반대로 하면 토큰이 없어 전부 401 → /login으로 튕긴다.
#
# MySQL 위치는 환경마다 다르므로 환경변수로 덮을 수 있다(PowerShell판이 경로를 하드코딩한 것과
# 달리, mac은 Homebrew(arm/intel)·MySQL.com 설치본이 제각각이라 자동탐색 + override로 둔다):
#   MYSQLD_BIN=/opt/homebrew/opt/mysql/bin/mysqld  MYSQL_DATADIR=~/sugo-mysql-data ./dev-mysql.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/port-contract.sh"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
MYSQL_PORT="$SUGO_MYSQL_PORT"
API_PORT="$SUGO_E2E_API_PORT"
UI_PORT="$SUGO_E2E_UI_PORT"

info() { printf '\033[36m[dev]\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m[dev]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[dev]\033[0m %s\n' "$1"; }
die()  { printf '\033[31m[dev]\033[0m %s\n' "$1" >&2; exit 1; }

export MYSQL_PASSWORD="${MYSQL_PASSWORD:-sugo_local_dev}"
export SESSION_SECRET="${SESSION_SECRET:-sugo_local_session_secret_dev}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-sugo_dashboard}"
export DB_DRIVER="mysql"
export MYSQL_PORT
export PORT="$API_PORT"
export FRONTEND_URL="http://localhost:$UI_PORT"
export CORS_ORIGINS="$FRONTEND_URL"
export VITE_API_BASE="http://localhost:$API_PORT"

MYSQL_DATADIR="${MYSQL_DATADIR:-$HOME/sugo-mysql-data}"

find_mysqld() {
  if [ -n "${MYSQLD_BIN:-}" ]; then printf '%s' "$MYSQLD_BIN"; return; fi
  if command -v mysqld >/dev/null 2>&1; then command -v mysqld; return; fi
  for c in /opt/homebrew/opt/mysql/bin/mysqld \
           /usr/local/opt/mysql/bin/mysqld \
           /usr/local/mysql/bin/mysqld \
           /usr/sbin/mysqld; do
    [ -x "$c" ] && printf '%s' "$c" && return
  done
  printf ''
}

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

sugo_require_port_free "$API_PORT" "Dashboard E2E API"
sugo_require_port_free "$UI_PORT" "Dashboard E2E UI"

# 1) MySQL
if sugo_port_open "$MYSQL_PORT"; then
  ok "MySQL 이미 떠 있음 (:$MYSQL_PORT)"
else
  MYSQLD="$(find_mysqld)"
  [ -n "$MYSQLD" ] || die "mysqld를 못 찾음. MYSQLD_BIN 으로 경로를 지정하세요 (예: brew install mysql)."
  [ -d "$MYSQL_DATADIR" ] || die "데이터 디렉터리가 없습니다: $MYSQL_DATADIR (MYSQL_DATADIR 로 지정하거나 mysqld --initialize 로 만드세요)"
  info "MySQL 기동… ($MYSQLD)"
  "$MYSQLD" --datadir="$MYSQL_DATADIR" --port="$MYSQL_PORT" --bind-address=127.0.0.1 >/dev/null 2>&1 &
  pids+=("$!")
  sugo_wait_port "$MYSQL_PORT" "MySQL"
fi

# 2) 백엔드
info "백엔드 기동…"
(cd "$BACKEND" && npx tsx src/index.ts) & pids+=("$!")
sugo_wait_port "$API_PORT" "백엔드"

# 3) 프론트 빌드 → preview  (빌드가 먼저! dist/를 비우므로)
info "프론트 빌드…"
(cd "$FRONTEND" && npx vite build)

info "프론트 preview 기동…"
(cd "$FRONTEND" && npx vite preview --host 127.0.0.1 --port "$UI_PORT" --strictPort) & pids+=("$!")
sugo_wait_port "$UI_PORT" "프론트"

# 4) 시드 + dev-login.html  (빌드 뒤에 와야 안 지워진다)
info "데모 데이터 시드…"
(cd "$BACKEND" && npx tsx dev-local.mts)

echo
ok "  ▶ http://localhost:$UI_PORT/dev-login.html  를 브라우저에서 여세요 (끝)"
printf '\033[90m    /login 의 로그인 버튼은 GitHub OAuth 미설정이라 503이 정상입니다.\033[0m\n'
printf '\033[90m    Ctrl+C 로 이 스크립트가 띄운 프로세스를 정리합니다.\033[0m\n'
echo
wait

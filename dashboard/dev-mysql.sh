#!/usr/bin/env bash
# Sugo Dashboard 로컬 확인 (실제 MySQL) — dev-mysql.ps1의 POSIX(mac/리눅스) 대응판.
#
#   cd ~/sugo/dashboard && ./dev-mysql.sh
#   → http://localhost:4173/dev-login.html
#
# 하는 일: MySQL 기동 확인 → 백엔드(:3001) → 프론트 빌드+preview(:4173) → 시드 + dev-login.html.
#
# ⚠️ 순서가 중요하다: `vite build`가 dist/를 비우면서 dev-login.html까지 지운다.
#    반드시 **빌드 → 시드** 순서여야 한다. 반대로 하면 토큰이 없어 전부 401 → /login으로 튕긴다.
#
# MySQL 위치는 환경마다 다르므로 환경변수로 덮을 수 있다(PowerShell판이 경로를 하드코딩한 것과
# 달리, mac은 Homebrew(arm/intel)·MySQL.com 설치본이 제각각이라 자동탐색 + override로 둔다):
#   MYSQLD_BIN=/opt/homebrew/opt/mysql/bin/mysqld  MYSQL_DATADIR=~/sugo-mysql-data ./dev-mysql.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

info() { printf '\033[36m[dev]\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m[dev]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[dev]\033[0m %s\n' "$1"; }
die()  { printf '\033[31m[dev]\033[0m %s\n' "$1" >&2; exit 1; }

export MYSQL_PASSWORD="${MYSQL_PASSWORD:-sugo_local_dev}"
export SESSION_SECRET="${SESSION_SECRET:-sugo_local_session_secret_dev}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-sugo_dashboard}"
export DB_DRIVER="mysql"
export PORT="3001"
export CORS_ORIGINS="http://localhost:4173"
export VITE_API_BASE="http://localhost:3001"

MYSQL_DATADIR="${MYSQL_DATADIR:-$HOME/sugo-mysql-data}"

# 포트 점검은 외부 도구(nc/lsof) 없이 bash 내장 /dev/tcp로 — mac 기본 bash 3.2에서도 된다.
port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0
  return 1
}

wait_port() {
  local port="$1" what="$2" timeout="${3:-60}" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if port_open "$port"; then ok "$what 준비됨 (:$port)"; return 0; fi
    sleep 1
    waited=$((waited + 1))
  done
  die "$what 이(가) :$port 에서 안 뜹니다."
}

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

# 1) MySQL
if port_open 3306; then
  ok "MySQL 이미 떠 있음 (:3306)"
else
  MYSQLD="$(find_mysqld)"
  [ -n "$MYSQLD" ] || die "mysqld를 못 찾음. MYSQLD_BIN 으로 경로를 지정하세요 (예: brew install mysql)."
  [ -d "$MYSQL_DATADIR" ] || die "데이터 디렉터리가 없습니다: $MYSQL_DATADIR (MYSQL_DATADIR 로 지정하거나 mysqld --initialize 로 만드세요)"
  info "MySQL 기동… ($MYSQLD)"
  "$MYSQLD" --datadir="$MYSQL_DATADIR" --port=3306 --bind-address=127.0.0.1 >/dev/null 2>&1 &
  pids+=("$!")
  wait_port 3306 "MySQL"
fi

# 2) 백엔드
if port_open 3001; then
  warn ":3001 이미 사용 중 — 기존 백엔드를 그대로 씁니다(코드를 고쳤다면 그 프로세스를 끄고 다시 실행)."
else
  info "백엔드 기동…"
  (cd "$BACKEND" && npx tsx src/index.ts) & pids+=("$!")
  wait_port 3001 "백엔드"
fi

# 3) 프론트 빌드 → preview  (빌드가 먼저! dist/를 비우므로)
info "프론트 빌드…"
(cd "$FRONTEND" && npx vite build)

if port_open 4173; then
  warn ":4173 이미 사용 중 — 기존 preview 사용"
else
  info "프론트 preview 기동…"
  (cd "$FRONTEND" && npx vite preview --port 4173) & pids+=("$!")
  wait_port 4173 "프론트"
fi

# 4) 시드 + dev-login.html  (빌드 뒤에 와야 안 지워진다)
info "데모 데이터 시드…"
(cd "$BACKEND" && npx tsx dev-local.mts)

echo
ok "  ▶ http://localhost:4173/dev-login.html  를 브라우저에서 여세요 (끝)"
printf '\033[90m    /login 의 로그인 버튼은 GitHub OAuth 미설정이라 503이 정상입니다.\033[0m\n'
printf '\033[90m    Ctrl+C 로 이 스크립트가 띄운 프로세스를 정리합니다.\033[0m\n'
echo
wait

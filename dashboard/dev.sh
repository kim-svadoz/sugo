#!/usr/bin/env bash
# Sugo Dashboard 로컬 개발 — 백엔드(:3001) + 프론트(:5173)를 한 번에 띄운다.
# dev.ps1의 POSIX(mac/리눅스) 대응판. 동작과 포트·기본값을 의도적으로 똑같이 맞췄다.
#
#   cd ~/sugo/dashboard && ./dev.sh
#
# 사전: backend/.env 에 GitHub OAuth App 값(GITHUB_CLIENT_ID/SECRET)만 채워두면 됨
#       (backend/.env.example 복사). DB는 sqlite라 MySQL 불필요.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

info()  { printf '\033[36m[dev]\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m[dev]\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m[dev]\033[0m %s\n' "$1"; }

# 1) backend/.env 로드(있으면) — KEY=VALUE 라인만, 주석/빈줄 무시
ENV_FILE="$BACKEND/.env"
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    name="${line%%=*}"
    val="${line#*=}"
    # 앞뒤 공백 제거 후 감싼 큰따옴표만 벗긴다(PowerShell판과 동일한 규칙)
    name="$(printf '%s' "$name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    val="$(printf '%s' "$val" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    case "$val" in \"*\") val="${val#\"}"; val="${val%\"}" ;; esac
    export "$name=$val"
  done < "$ENV_FILE"
  ok "loaded env from backend/.env"
else
  warn "backend/.env 없음 — backend/.env.example 를 backend/.env 로 복사해 GitHub 값을 채우세요."
fi

# 2) 로컬 기본값(미설정 시에만)
: "${DB_DRIVER:=sqlite}"
: "${SQLITE_FILE:=./local.db}"
: "${SESSION_SECRET:=dev-secret-change-me}"
: "${FRONTEND_URL:=http://localhost:5173}"
: "${CORS_ORIGINS:=http://localhost:5173}"
export DB_DRIVER SQLITE_FILE SESSION_SECRET FRONTEND_URL CORS_ORIGINS
export VITE_API_BASE="http://localhost:3001"

if [ -z "${GITHUB_CLIENT_ID:-}" ]; then
  warn "경고: GITHUB_CLIENT_ID 미설정 → 로그인 버튼이 503을 냅니다. backend/.env 에 OAuth App 값을 넣으세요."
fi

# 3) 의존성 설치(최초 1회만)
for dir in "$BACKEND" "$FRONTEND"; do
  if [ ! -d "$dir/node_modules" ]; then
    info "npm i in $dir ..."
    (cd "$dir" && npm i)
  fi
done

# 4) 백엔드/프론트를 백그라운드로 실행. PowerShell판은 새 창을 띄우지만 mac엔 대응물이 없어
#    로그를 이 터미널에 합치고, Ctrl+C 한 번으로 둘 다 정리되게 트랩을 건다.
pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

ok "starting backend(:3001) + frontend(:5173)..."
(cd "$BACKEND" && npm run dev) & pids+=("$!")
(cd "$FRONTEND" && VITE_API_BASE=http://localhost:3001 npm run dev) & pids+=("$!")

ok "✅ http://localhost:5173  → Sign in with GitHub   (Ctrl+C 로 둘 다 종료)"
wait

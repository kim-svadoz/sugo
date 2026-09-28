#!/usr/bin/env bash
# shellcheck shell=bash

SUGO_PORT_CONTRACT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ports.env contains only repository-owned numeric constants.
# shellcheck disable=SC1091
source "$SUGO_PORT_CONTRACT_ROOT/ports.env"

sugo_validate_port_contract() {
  local seen=' ' port
  for port in "$SUGO_MYSQL_PORT" "$SUGO_LOCAL_API_PORT" "$SUGO_LOCAL_UI_PORT" \
    "$SUGO_E2E_API_PORT" "$SUGO_E2E_UI_PORT" "$SUGO_E2E_OIDC_PORT" "$SUGO_E2E_BITBUCKET_PORT"; do
    case "$port" in ''|*[!0-9]*) printf 'ports.env에 잘못된 포트가 있습니다: %s\n' "$port" >&2; return 1 ;; esac
    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { printf 'ports.env 포트 범위 오류: %s\n' "$port" >&2; return 1; }
    case "$seen" in *" $port "*) printf 'ports.env 중복 포트: %s\n' "$port" >&2; return 1 ;; esac
    seen="$seen$port "
  done
}
sugo_validate_port_contract

sugo_port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0
  return 1
}

sugo_describe_port_owner() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 0
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  local pid cwd
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    [ -n "$cwd" ] && printf '  pid %s cwd: %s\n' "$pid" "$cwd" >&2
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

sugo_require_port_free() {
  local port="$1" label="$2"
  if ! sugo_port_open "$port"; then return 0; fi
  printf '\033[31m[port]\033[0m %s 전용 포트 :%s 가 이미 사용 중입니다. 자동으로 다른 포트를 고르지 않습니다.\n' "$label" "$port" >&2
  sugo_describe_port_owner "$port"
  return 1
}

sugo_wait_port() {
  local port="$1" label="$2" timeout="${3:-60}" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if sugo_port_open "$port"; then
      printf '\033[32m[port]\033[0m %s 준비됨 (:%s)\n' "$label" "$port"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  printf '\033[31m[port]\033[0m %s 이(가) :%s 에서 시작되지 않았습니다.\n' "$label" "$port" >&2
  return 1
}

sugo_print_port_contract() {
  printf '%-24s %-7s %s\n' 'SERVICE' 'PORT' 'STATUS'
  printf '%-24s %-7s %s\n' '------------------------' '-------' '------'
  while IFS='|' read -r label port; do
    local status='free'
    sugo_port_open "$port" && status='in use'
    printf '%-24s %-7s %s\n' "$label" "$port" "$status"
    [ "$status" = 'in use' ] && sugo_describe_port_owner "$port"
  done <<EOF
MySQL|$SUGO_MYSQL_PORT
Sugo local API|$SUGO_LOCAL_API_PORT
Sugo local UI|$SUGO_LOCAL_UI_PORT
Dashboard E2E API|$SUGO_E2E_API_PORT
Dashboard E2E UI|$SUGO_E2E_UI_PORT
Dashboard E2E OIDC|$SUGO_E2E_OIDC_PORT
Dashboard E2E Bitbucket|$SUGO_E2E_BITBUCKET_PORT
EOF
}

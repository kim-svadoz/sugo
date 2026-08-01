# Sugo Dashboard 로컬 확인 (실제 MySQL) — PowerShell 전용
#
#   cd C:\Users\user\sugo\dashboard
#   .\dev-mysql.ps1
#
# 하는 일: MySQL 기동 확인 → 백엔드(:3001) → 프론트 빌드+preview(:4173) → 시드 + dev-login.html.
#
# ⚠️ 순서가 중요하다: `vite build`가 dist/를 비우면서 dev-login.html까지 지운다.
#    반드시 **빌드 → 시드** 순서여야 한다. 반대로 하면 토큰이 없어 전부 401 → /login으로 튕긴다.
# ⚠️ PowerShell 5.1은 native exe의 stderr를 ErrorRecord로 감싼다. `$ErrorActionPreference="Stop"`
# 이면 vite/tsx가 경고 한 줄만 stderr로 내보내도 스크립트가 죽는다(빌드는 성공했는데도).
# 그래서 Stop을 쓰지 않고, 외부 명령은 아래 Invoke-Step이 **종료코드로만** 판정한다.
$ErrorActionPreference = "Continue"

function Invoke-Step([string]$Label, [string]$WorkDir, [string]$CommandLine) {
  Write-Host "[dev] $Label" -ForegroundColor Cyan
  Push-Location $WorkDir
  try {
    & cmd.exe /c $CommandLine
    if ($LASTEXITCODE -ne 0) { throw "$Label 실패 (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

$root     = $PSScriptRoot
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

$env:MYSQL_PASSWORD  = "sugo_local_dev"
$env:SESSION_SECRET  = "sugo_local_session_secret_dev"
$env:MYSQL_DATABASE  = "sugo_dashboard"
$env:DB_DRIVER       = "mysql"
$env:PORT            = "3001"
$env:CORS_ORIGINS    = "http://localhost:4173"
$env:VITE_API_BASE   = "http://localhost:3001"

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port([int]$Port, [string]$What, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) { Write-Host "[dev] $What 준비됨 (:$Port)" -ForegroundColor Green; return }
    Start-Sleep -Milliseconds 500
  }
  throw "$What 이(가) :$Port 에서 안 뜹니다."
}

# 1) MySQL
if (Test-Port 3306) {
  Write-Host "[dev] MySQL 이미 떠 있음 (:3306)" -ForegroundColor Green
} else {
  $mysqld = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
  if (-not (Test-Path $mysqld)) { throw "mysqld를 못 찾음: $mysqld" }
  Write-Host "[dev] MySQL 기동…" -ForegroundColor Cyan
  Start-Process -FilePath $mysqld `
    -ArgumentList '--datadir=C:\Users\user\sugo-mysql-data', '--port=3306', '--bind-address=127.0.0.1' `
    -WindowStyle Hidden
  Wait-Port 3306 "MySQL"
}

# 2) 백엔드
if (Test-Port 3001) {
  Write-Host "[dev] :3001 이미 사용 중 — 기존 백엔드를 그대로 씁니다(코드를 고쳤다면 그 창을 닫고 다시 실행)." -ForegroundColor Yellow
} else {
  Write-Host "[dev] 백엔드 기동…" -ForegroundColor Cyan
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx tsx src/index.ts" -WorkingDirectory $backend
  Wait-Port 3001 "백엔드"
}

# 3) 프론트 빌드 → preview  (빌드가 먼저! dist/를 비우므로)
Invoke-Step "프론트 빌드…" $frontend "npx vite build"

if (-not (Test-Port 4173)) {
  Write-Host "[dev] 프론트 preview 기동…" -ForegroundColor Cyan
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx vite preview --port 4173" -WorkingDirectory $frontend
  Wait-Port 4173 "프론트"
} else {
  Write-Host "[dev] :4173 이미 사용 중 — 기존 preview 사용" -ForegroundColor Yellow
}

# 4) 시드 + dev-login.html  (빌드 뒤에 와야 안 지워진다)
Invoke-Step "데모 데이터 시드…" $backend "npx tsx dev-local.mts"

Write-Host ""
Write-Host "  ▶ http://localhost:4173/dev-login.html  를 브라우저에서 여세요 (끝)" -ForegroundColor Green
Write-Host "    /login 의 로그인 버튼은 GitHub OAuth 미설정이라 503이 정상입니다." -ForegroundColor DarkGray
Write-Host ""

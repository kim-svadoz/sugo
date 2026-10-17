# Sugo Dashboard 로컬 확인 (실제 MySQL) — PowerShell 전용
#
#   cd <저장소 경로>\dashboard
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
. (Join-Path $root "port-contract.ps1")
$mysqlPort = Get-SugoPort "SUGO_MYSQL_PORT"
$apiPort = Get-SugoPort "SUGO_E2E_API_PORT"
$uiPort = Get-SugoPort "SUGO_E2E_UI_PORT"

$env:MYSQL_PASSWORD  = "sugo_local_dev"
$env:SESSION_SECRET  = "sugo_local_session_secret_dev"
$env:MYSQL_DATABASE  = "sugo_dashboard"
$env:DB_DRIVER       = "mysql"
$env:MYSQL_PORT      = "$mysqlPort"
$env:PORT            = "$apiPort"
$env:FRONTEND_URL    = "http://localhost:$uiPort"
$env:CORS_ORIGINS    = $env:FRONTEND_URL
$env:VITE_API_BASE   = "http://localhost:$apiPort"

Assert-SugoPortFree $apiPort "Dashboard E2E API"
Assert-SugoPortFree $uiPort "Dashboard E2E UI"

# 1) MySQL
if (Test-SugoPort $mysqlPort) {
  Write-Host "[dev] MySQL 이미 떠 있음 (:$mysqlPort)" -ForegroundColor Green
} else {
  $mysqld = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
  if (-not (Test-Path $mysqld)) { throw "mysqld를 못 찾음: $mysqld" }
  Write-Host "[dev] MySQL 기동…" -ForegroundColor Cyan
  Start-Process -FilePath $mysqld `
    -ArgumentList "--datadir=$env:USERPROFILE\sugo-mysql-data", "--port=$mysqlPort", '--bind-address=127.0.0.1' `
    -WindowStyle Hidden
  Wait-SugoPort $mysqlPort "MySQL"
}

# 2) 백엔드
Write-Host "[dev] 백엔드 기동…" -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx tsx src/index.ts" -WorkingDirectory $backend
Wait-SugoPort $apiPort "백엔드"

# 3) 프론트 빌드 → preview  (빌드가 먼저! dist/를 비우므로)
Invoke-Step "프론트 빌드…" $frontend "npx vite build"

Write-Host "[dev] 프론트 preview 기동…" -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx vite preview --host 127.0.0.1 --port $uiPort --strictPort" -WorkingDirectory $frontend
Wait-SugoPort $uiPort "프론트"

# 4) 시드 + dev-login.html  (빌드 뒤에 와야 안 지워진다)
Invoke-Step "데모 데이터 시드…" $backend "npx tsx dev-local.mts"

Write-Host ""
Write-Host "  ▶ http://localhost:$uiPort/dev-login.html  를 브라우저에서 여세요 (끝)" -ForegroundColor Green
Write-Host "    /login 의 로그인 버튼은 GitHub OAuth 미설정이라 503이 정상입니다." -ForegroundColor DarkGray
Write-Host ""

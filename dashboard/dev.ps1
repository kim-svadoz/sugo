# Sugo Dashboard 로컬 개발 — ports.env의 고정 API/UI 포트를 한 번에 띄운다.
# 사용법(PowerShell):  cd C:\Users\user\sugo\dashboard ;  ./dev.ps1
# 사전: backend/.env 에 GitHub OAuth App 값(GITHUB_CLIENT_ID/SECRET)만 채워두면 됨
#       (backend/.env.example 복사). DB는 sqlite라 MySQL 불필요.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
. (Join-Path $root "port-contract.ps1")
$apiPort = Get-SugoPort "SUGO_LOCAL_API_PORT"
$uiPort = Get-SugoPort "SUGO_LOCAL_UI_PORT"

# 1) backend/.env 로드(있으면) — KEY=VALUE 라인만, 주석/빈줄 무시
$envFile = Join-Path $backend ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $idx = $line.IndexOf("=")
      $name = $line.Substring(0, $idx).Trim()
      $val = $line.Substring($idx + 1).Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      [Environment]::SetEnvironmentVariable($name, $val, "Process")
    }
  }
  Write-Host "[dev] loaded env from backend/.env" -ForegroundColor Green
} else {
  Write-Host "[dev] backend/.env 없음 — backend/.env.example 를 backend/.env 로 복사해 GitHub 값을 채우세요." -ForegroundColor Yellow
}

# 2) 로컬 기본값(미설정 시에만)
if (-not $env:DB_DRIVER)      { $env:DB_DRIVER = "sqlite" }
if (-not $env:SQLITE_FILE)    { $env:SQLITE_FILE = "./local.db" }
if (-not $env:SESSION_SECRET) { $env:SESSION_SECRET = "dev-secret-change-me" }
$env:PORT = "$apiPort"
$env:FRONTEND_URL = "http://localhost:$uiPort"
$env:CORS_ORIGINS = $env:FRONTEND_URL
$env:VITE_API_BASE = "http://localhost:$apiPort"

if (-not $env:GITHUB_CLIENT_ID) {
  Write-Host "[dev] 경고: GITHUB_CLIENT_ID 미설정 → 로그인 버튼이 503을 냅니다. backend/.env 에 OAuth App 값을 넣으세요." -ForegroundColor Yellow
}

# 3) 의존성 설치(최초 1회만)
foreach ($dir in @($backend, $frontend)) {
  if (-not (Test-Path (Join-Path $dir "node_modules"))) {
    Write-Host "[dev] npm i in $dir ..." -ForegroundColor Cyan
    Push-Location $dir; npm i; Pop-Location
  }
}

# 4) 백엔드/프론트를 각각 새 창에서 실행(로그 분리). 자식 창은 위에서 세팅한 env를 그대로 상속.
Assert-SugoPortFree $apiPort "Sugo Dashboard API"
Assert-SugoPortFree $uiPort "Sugo Dashboard UI"
Write-Host "[dev] starting backend(:$apiPort) + frontend(:$uiPort) in new windows..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontend'; `$env:VITE_API_BASE='http://localhost:$apiPort'; npm run dev -- --host 127.0.0.1 --port $uiPort --strictPort"

Write-Host "[dev] ✅ http://localhost:$uiPort  → Sign in with GitHub" -ForegroundColor Green

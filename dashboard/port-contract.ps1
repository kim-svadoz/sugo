$script:SugoPorts = @{}
$portsFile = Join-Path $PSScriptRoot "ports.env"
Get-Content $portsFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    $script:SugoPorts[$parts[0]] = [int]$parts[1]
  }
}
if (@($script:SugoPorts.Values | Select-Object -Unique).Count -ne $script:SugoPorts.Values.Count) {
  throw "ports.env에 중복 포트가 있습니다."
}

function Get-SugoPort([string]$Name) {
  if (-not $script:SugoPorts.ContainsKey($Name)) { throw "ports.env에 $Name 이 없습니다." }
  return [int]$script:SugoPorts[$Name]
}

function Test-SugoPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Assert-SugoPortFree([int]$Port, [string]$Label) {
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) { return }
  Write-Host "[port] $Label 전용 포트 :$Port 가 이미 사용 중입니다. 자동으로 다른 포트를 고르지 않습니다." -ForegroundColor Red
  $listeners | ForEach-Object {
    $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  pid $($_.OwningProcess) process: $($process.ProcessName)" -ForegroundColor Yellow
  }
  throw "$Label 포트 충돌"
}

function Wait-SugoPort([int]$Port, [string]$Label, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-SugoPort $Port) { Write-Host "[port] $Label 준비됨 (:$Port)" -ForegroundColor Green; return }
    Start-Sleep -Milliseconds 500
  }
  throw "$Label 이(가) :$Port 에서 시작되지 않았습니다."
}

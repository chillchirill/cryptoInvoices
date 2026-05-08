param(
  [switch]$SkipDocker,
  [switch]$NoDev,
  [int]$DockerTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "OK: $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host "WARN: $Message" -ForegroundColor Yellow
}

function Require-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

function Test-DockerReady {
  try {
    docker info *> $null
    return $true
  } catch {
    return $false
  }
}

function Start-DockerDesktop {
  $candidates = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LocalAppData\Docker\Docker Desktop.exe"
  )

  $dockerDesktop = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $dockerDesktop) {
    throw "Docker Desktop was not found. Install it from https://www.docker.com/products/docker-desktop/ and run this script again."
  }

  Write-Step "Starting Docker Desktop"
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
}

function Wait-Docker {
  param([int]$TimeoutSeconds)

  Write-Step "Waiting for Docker engine"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-DockerReady) {
      Write-Ok "Docker engine is ready"
      return
    }

    Write-Host "." -NoNewline
    Start-Sleep -Seconds 3
  }

  throw "Docker did not become ready within $TimeoutSeconds seconds. Open Docker Desktop manually, wait until it says it is running, then run .\start.ps1 again."
}

Write-Step "Checking tools"
Require-Command "npm" "Install Node.js LTS from https://nodejs.org/"
Require-Command "docker" "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
Write-Ok "Required commands are available"

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Write-Step "Creating .env from .env.example"
  Copy-Item ".env.example" ".env"
  Write-Ok ".env created"
}

if ((Test-Path ".env") -and -not (Select-String -Path ".env" -Pattern "^VITE_PUBLIC_PAYMENT_ORIGIN=" -Quiet)) {
  Write-Step "Adding test payment origin to .env"
  Add-Content ".env" "VITE_PUBLIC_PAYMENT_ORIGIN=http://192.168.137.1:5173"
  Write-Ok "VITE_PUBLIC_PAYMENT_ORIGIN added"
}

if (-not $SkipDocker) {
  if (-not (Test-DockerReady)) {
    Start-DockerDesktop
    Wait-Docker -TimeoutSeconds $DockerTimeoutSeconds
  } else {
    Write-Ok "Docker engine is already running"
  }

  Write-Step "Starting PostgreSQL container"
  docker compose up -d
  Write-Ok "PostgreSQL container requested"
} else {
  Write-Warn "Docker startup skipped. Make sure PostgreSQL is available on DATABASE_URL."
}

if (-not (Test-Path "node_modules")) {
  Write-Step "Installing npm dependencies"
  npm install
  Write-Ok "Dependencies installed"
} else {
  Write-Ok "node_modules already exists"
}

Write-Step "Checking frontend build"
npm run build
Write-Ok "Frontend build passed"

if ($NoDev) {
  Write-Ok "Done. Dev servers were not started because -NoDev was used."
  exit 0
}

Write-Step "Starting app"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:4000/api/health"
Write-Host "Press Ctrl+C to stop."
npm run dev

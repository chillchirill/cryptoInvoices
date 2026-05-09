#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-prod}"
NODE_MAJOR_REQUIRED="${NODE_MAJOR_REQUIRED:-22}"
DOCKER_TIMEOUT_SECONDS="${DOCKER_TIMEOUT_SECONDS:-180}"
APT_UPDATED=0
SUDO=()
DOCKER_CMD=()

if (( EUID != 0 )); then
  SUDO=(sudo)
fi

usage() {
  cat <<'USAGE'
Usage:
  ./start.sh [prod|start|build|dev|test|help]

Modes:
  prod    Default. Prepare Ubuntu, start PostgreSQL, install deps, build frontend, start Express.
  start   Prepare Ubuntu, start PostgreSQL, install deps, start Express without rebuilding.
  build   Prepare Ubuntu, start PostgreSQL, install deps, build frontend only.
  dev     Prepare Ubuntu, start PostgreSQL, install deps, start Vite + backend dev servers.
  test    Prepare Ubuntu, start PostgreSQL, install deps, run backend tests.
  help    Show this help.

Environment:
  APP_ORIGIN=https://pairhold.com      Public app URL baked into production QR links.
  PORT=4000                            Backend port used by npm start.
  DOCKER_TIMEOUT_SECONDS=180           Seconds to wait for the Docker engine.
  NODE_MAJOR_REQUIRED=22               Minimum Node.js major version.
  SKIP_DOCKER=1                        Skip Docker startup when DATABASE_URL points elsewhere.

Examples:
  ./start.sh
  APP_ORIGIN=https://pay.example.com ./start.sh prod
  ./start.sh start
  ./start.sh dev
  ./start.sh build
USAGE
}

step() {
  printf '\n==> %s\n' "$1"
}

ok() {
  printf 'OK: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_sudo() {
  if (( EUID != 0 )) && ! has_command sudo; then
    fail "sudo is required to install missing system packages. Run as root or install sudo first."
  fi
}

run_sudo() {
  require_sudo
  "${SUDO[@]}" "$@"
}

require_ubuntu() {
  if [[ ! -r /etc/os-release ]]; then
    fail "This bootstrap script installs packages only on Ubuntu."
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    fail "This bootstrap script targets Ubuntu only. Detected: ${PRETTY_NAME:-unknown Linux}."
  fi
}

apt_update_once() {
  if (( APT_UPDATED == 0 )); then
    run_sudo apt-get update
    APT_UPDATED=1
  fi
}

install_base_packages() {
  require_ubuntu
  apt_update_once
  run_sudo apt-get install -y ca-certificates curl gnupg
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0'
}

ensure_node() {
  if has_command node && has_command npm && (( "$(node_major)" >= NODE_MAJOR_REQUIRED )); then
    ok "Node.js $(node -v) and npm $(npm -v) are available"
    return
  fi

  step "Installing Node.js ${NODE_MAJOR_REQUIRED}.x and npm"
  install_base_packages
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_REQUIRED}.x" -o /tmp/nodesource_setup.sh
  if (( EUID == 0 )); then
    bash /tmp/nodesource_setup.sh
  else
    sudo -E bash /tmp/nodesource_setup.sh
  fi
  run_sudo apt-get install -y nodejs

  has_command node || fail "Node.js installation finished, but node is still unavailable."
  has_command npm || fail "Node.js installation finished, but npm is still unavailable."
  (( "$(node_major)" >= NODE_MAJOR_REQUIRED )) || fail "Node.js $(node -v) is below required major ${NODE_MAJOR_REQUIRED}."
  ok "Installed Node.js $(node -v) and npm $(npm -v)"
}

docker_compose_available() {
  docker compose version >/dev/null 2>&1 || run_sudo docker compose version >/dev/null 2>&1
}

install_docker() {
  step "Installing Docker Engine and Docker Compose plugin"
  install_base_packages

  run_sudo apt-get remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc || true
  run_sudo install -m 0755 -d /etc/apt/keyrings
  run_sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  run_sudo chmod a+r /etc/apt/keyrings/docker.asc

  # shellcheck disable=SC1091
  . /etc/os-release
  local_codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  [[ -n "$local_codename" ]] || fail "Could not detect Ubuntu codename for Docker apt repository."

  repo_line="deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${local_codename} stable"
  printf '%s\n' "$repo_line" | run_sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  APT_UPDATED=0
  apt_update_once
  run_sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ok "Docker packages installed"
}

docker_info_available() {
  docker info >/dev/null 2>&1 || run_sudo docker info >/dev/null 2>&1
}

start_docker_service() {
  if docker_info_available; then
    ok "Docker engine is already running"
    return
  fi

  step "Starting Docker service"
  if has_command systemctl && systemctl list-unit-files docker.service >/dev/null 2>&1; then
    run_sudo systemctl start docker || true
  fi

  if ! docker_info_available && has_command service; then
    run_sudo service docker start || true
  fi
}

wait_for_docker() {
  step "Waiting for Docker engine"
  deadline=$((SECONDS + DOCKER_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    if docker_info_available; then
      ok "Docker engine is ready"
      return
    fi
    printf '.'
    sleep 3
  done

  printf '\n'
  fail "Docker did not become ready within ${DOCKER_TIMEOUT_SECONDS} seconds."
}

choose_docker_command() {
  if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    return
  fi

  if run_sudo docker info >/dev/null 2>&1; then
    DOCKER_CMD=("${SUDO[@]}" docker)
    return
  fi

  fail "Docker is installed but not usable by this user, even through sudo."
}

ensure_docker() {
  if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
    warn "Docker startup skipped because SKIP_DOCKER=1. DATABASE_URL must point to a running PostgreSQL."
    return
  fi

  if ! has_command docker || ! docker_compose_available; then
    install_docker
  else
    ok "Docker and Compose plugin are available"
  fi

  start_docker_service
  wait_for_docker
  choose_docker_command
}

docker_compose() {
  "${DOCKER_CMD[@]}" compose "$@"
}

ensure_env() {
  if [[ ! -f .env && -f .env.example ]]; then
    step "Creating .env from .env.example"
    cp .env.example .env
    ok ".env created"
  fi
}

start_postgres() {
  if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
    return
  fi

  step "Starting PostgreSQL container"
  docker_compose up -d postgres
  ok "PostgreSQL container requested"
}

dependencies_need_install() {
  if [[ ! -d node_modules ]]; then
    return 0
  fi

  for file in package.json package-lock.json apps/backend/package.json apps/frontend/package.json; do
    if [[ -f "$file" && "$file" -nt node_modules ]]; then
      return 0
    fi
  done

  return 1
}

ensure_dependencies() {
  if dependencies_need_install; then
    step "Installing npm dependencies"
    npm install
    ok "Dependencies installed"
  else
    ok "npm dependencies already look installed"
  fi
}

configure_production_env() {
  export APP_ORIGIN="${APP_ORIGIN:-https://pairhold.com}"
  export VITE_PUBLIC_PAYMENT_ORIGIN="$APP_ORIGIN"
  export FRONTEND_URL="${FRONTEND_URL:-$APP_ORIGIN}"
  ok "Production app origin: $APP_ORIGIN"
}

build_frontend() {
  configure_production_env
  step "Building frontend"
  npm run build
  [[ -f apps/frontend/dist/index.html ]] || fail "Frontend build finished but apps/frontend/dist/index.html was not found."
  ok "Frontend build is ready"
}

require_frontend_build() {
  [[ -f apps/frontend/dist/index.html ]] || fail "Frontend build is missing. Run ./start.sh build or ./start.sh prod first."
}

prepare() {
  ensure_env
  ensure_node
  ensure_docker
  start_postgres
  ensure_dependencies
}

case "$MODE" in
  help|-h|--help)
    usage
    ;;
  prod|production)
    prepare
    build_frontend
    step "Starting production app"
    printf 'App:    %s\n' "$APP_ORIGIN"
    printf 'Health: %s/api/health\n' "$APP_ORIGIN"
    printf 'Press Ctrl+C to stop the Node process. PostgreSQL remains running in Docker.\n'
    npm start
    ;;
  start)
    prepare
    configure_production_env
    require_frontend_build
    step "Starting production app without rebuild"
    printf 'App:    %s\n' "$APP_ORIGIN"
    printf 'Health: %s/api/health\n' "$APP_ORIGIN"
    printf 'Press Ctrl+C to stop the Node process. PostgreSQL remains running in Docker.\n'
    npm start
    ;;
  build)
    prepare
    build_frontend
    ;;
  dev|development)
    prepare
    step "Starting development servers"
    printf 'Frontend: http://localhost:5173\n'
    printf 'Backend:  http://localhost:4000/api/health\n'
    printf 'Press Ctrl+C to stop.\n'
    npm run dev
    ;;
  test)
    prepare
    step "Running tests"
    npm test
    ;;
  *)
    usage
    fail "Unknown mode: $MODE"
    ;;
esac

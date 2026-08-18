#!/bin/sh

# Rebuild and (re)start OneCLI from a git checkout.
# Source: https://github.com/amirshub/onecli-cloud
#
# Usage (from anywhere):
#   ./scripts/run-onecli.sh
#
# VPN / remote access (publish on all interfaces, advertise a real host):
#   export ONECLI_BIND_HOST=0.0.0.0
#   export ONECLI_PUBLIC_HOST=100.x.y.z   # or Tailscale MagicDNS name
#   ./scripts/run-onecli.sh
#
# Optional:
#   ONECLI_APP_PORT / ONECLI_GATEWAY_PORT / POSTGRES_PORT / APP_URL / ONECLI_IMAGE
#   APP_VERSION  (defaults to <package.json>+<git sha>[-dirty])

set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-onecli}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: Docker Compose is not available." >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: missing $COMPOSE_FILE" >&2
  exit 1
fi

# Publish on all interfaces by default so VPN/LAN clients can reach the ports.
# Override with ONECLI_BIND_HOST=127.0.0.1 for local-only.
export ONECLI_BIND_HOST="${ONECLI_BIND_HOST:-0.0.0.0}"

# Browser/OAuth URL host — must be a real hostname or IP (never 0.0.0.0).
if [ -z "${ONECLI_PUBLIC_HOST:-}" ]; then
  if [ "$ONECLI_BIND_HOST" = "0.0.0.0" ] || [ "$ONECLI_BIND_HOST" = "127.0.0.1" ]; then
    ONECLI_PUBLIC_HOST="localhost"
  else
    ONECLI_PUBLIC_HOST="$ONECLI_BIND_HOST"
  fi
fi
export ONECLI_PUBLIC_HOST

APP_PORT="${ONECLI_APP_PORT:-10254}"
GATEWAY_PORT="${ONECLI_GATEWAY_PORT:-10255}"

# Stamp the image so /v1/health and /healthz report this checkout, not a leftover
# tag from a previous install (e.g. official 1.5.3). Override with APP_VERSION=.
if [ -z "${APP_VERSION:-}" ]; then
  if command -v jq >/dev/null 2>&1; then
    PKG="$(jq -r .version "$ROOT/package.json")"
  else
    PKG="$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n 1)"
  fi
  [ -n "$PKG" ] || PKG="0.0.0"
  SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  DIRTY=""
  if [ -d "$ROOT/.git" ]; then
    if ! git -C "$ROOT" diff --quiet --ignore-submodules -- 2>/dev/null \
      || ! git -C "$ROOT" diff --cached --quiet --ignore-submodules -- 2>/dev/null; then
      DIRTY="-dirty"
    fi
  fi
  APP_VERSION="${PKG}+${SHA}${DIRTY}"
fi
export APP_VERSION

echo ""
echo "  OneCLI: rebuild + restart"
echo "  Bind host:   $ONECLI_BIND_HOST"
echo "  Public host: $ONECLI_PUBLIC_HOST"
echo "  Version:     $APP_VERSION"
echo ""

echo "  Building and starting..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --build --force-recreate --wait onecli

echo ""
echo "  OneCLI is running!"
echo "  Dashboard:  http://$ONECLI_PUBLIC_HOST:$APP_PORT"
echo "  Gateway:    http://$ONECLI_PUBLIC_HOST:$GATEWAY_PORT"

HEALTH="$(curl -fsS "http://127.0.0.1:${APP_PORT}/v1/health" 2>/dev/null || true)"
if [ -n "$HEALTH" ]; then
  echo "  Health:     $HEALTH"
else
  echo "  Health:     (could not reach http://127.0.0.1:${APP_PORT}/v1/health)"
fi

echo ""
echo "  Tip: for VPN clients, set ONECLI_PUBLIC_HOST to this machine's VPN IP or MagicDNS name."
echo ""

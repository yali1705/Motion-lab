#!/usr/bin/env bash
# Deploy Motion Lab to Fly.io (idempotent). Used by .github/workflows/deploy.yml and locally.
#
# Required env:
#   FLY_API_TOKEN            Fly.io API token (never commit it)
#   MOTION_LAB_RENDER_TOKEN  the render access key users type in the editor (>= 16 chars)
# Optional:
#   FLY_APP     app name (default: motion-lab-<FLY_ORG or "app">), must be globally unique
#   FLY_ORG     Fly organisation slug (default: personal)
#   FLY_REGION  region for the machine + volume (default: fra)
set -euo pipefail
cd "$(dirname "$0")/.."

: "${FLY_API_TOKEN:?FLY_API_TOKEN is required}"
: "${MOTION_LAB_RENDER_TOKEN:?MOTION_LAB_RENDER_TOKEN is required}"
if [ "${#MOTION_LAB_RENDER_TOKEN}" -lt 16 ]; then echo "MOTION_LAB_RENDER_TOKEN must be at least 16 characters"; exit 1; fi
FLY_ORG="${FLY_ORG:-personal}"
FLY_REGION="${FLY_REGION:-fra}"
FLY_APP="${FLY_APP:-motion-lab-${FLY_ORG}}"
export FLY_API_TOKEN

command -v flyctl >/dev/null || { echo "flyctl not installed: https://fly.io/docs/flyctl/install/"; exit 1; }

echo "== app: $FLY_APP (org $FLY_ORG, region $FLY_REGION)"
if ! flyctl apps list --org "$FLY_ORG" --json | grep -q "\"Name\": *\"$FLY_APP\""; then
  flyctl apps create "$FLY_APP" --org "$FLY_ORG"
fi

echo "== volume"
if ! flyctl volumes list --app "$FLY_APP" --json | grep -q '"name": *"motion_lab_data"'; then
  flyctl volumes create motion_lab_data --app "$FLY_APP" --region "$FLY_REGION" --size 3 --yes
fi

echo "== secrets"
flyctl secrets set --app "$FLY_APP" --stage "MOTION_LAB_RENDER_TOKEN=$MOTION_LAB_RENDER_TOKEN" >/dev/null

echo "== deploy"
flyctl deploy --app "$FLY_APP" --config fly.toml --remote-only --ha=false --wait-timeout 600 --yes

URL="https://$FLY_APP.fly.dev"
echo "== health: $URL/api/health"
for i in $(seq 1 30); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then curl -sS "$URL/api/health"; echo; echo "DEPLOYED $URL"; exit 0; fi
  sleep 5
done
echo "health check did not pass at $URL"; exit 1

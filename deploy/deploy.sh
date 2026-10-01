#!/usr/bin/env bash
# Ręczne wdrożenie z własnego komputera: rsync repozytorium na VPS + restart usługi.
# To samo robi .github/workflows/deploy.yml po pushu do main.
#
# Użycie:
#   VPS_HOST=1.2.3.4 VPS_USER=tsoftware VPS_PATH=/opt/tsoftware deploy/deploy.sh
# Opcjonalnie: VPS_PORT=22 (port SSH), DRY_RUN=1 (tylko pokaż, co by się zmieniło).

set -euo pipefail

: "${VPS_HOST:?Ustaw VPS_HOST (adres lub nazwa serwera)}"
: "${VPS_USER:?Ustaw VPS_USER (użytkownik SSH)}"
: "${VPS_PATH:?Ustaw VPS_PATH (katalog na serwerze, np. /opt/tsoftware)}"
VPS_PORT="${VPS_PORT:-22}"

cd "$(dirname "$0")/.."

rsync_opts=(-az --delete --exclude '.git' --exclude 'server/data' --exclude '.env' --exclude 'node_modules')
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  rsync_opts+=(--dry-run --itemize-changes)
fi

echo "→ rsync ./ → ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"
rsync "${rsync_opts[@]}" -e "ssh -p ${VPS_PORT}" ./ "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "(DRY_RUN=1 – bez restartu)"
  exit 0
fi

echo "→ restart usługi tsoftware"
ssh -p "${VPS_PORT}" "${VPS_USER}@${VPS_HOST}" 'sudo systemctl restart tsoftware && systemctl is-active tsoftware'
echo "Gotowe."

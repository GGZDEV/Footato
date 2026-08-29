#!/usr/bin/env bash
set -Eeuo pipefail

# Automatic, transactional-ish updater for the self-hosted LXC installation.
# Runs as root because it controls the systemd service, while every Git/npm
# operation runs as the unprivileged Footato account.

APP_DIR="${FOOTATO_APP_DIR:-/opt/footato}"
APP_USER="${FOOTATO_APP_USER:-footato}"
SERVICE="${FOOTATO_SERVICE:-footato.service}"
STATE_DIR="${FOOTATO_UPDATE_STATE_DIR:-/var/lib/footato-update}"
LOCK_FILE="/run/lock/footato-update.lock"

mkdir -p "$STATE_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

run_app() {
  runuser -u "$APP_USER" -- "$@"
}

cd "$APP_DIR"

upstream="$(run_app git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [[ -z "$upstream" ]]; then
  echo "Footato: aucune branche distante suivie ; mise à jour ignorée." >&2
  exit 1
fi

run_app git fetch --quiet origin
current="$(run_app git rev-parse HEAD)"
target="$(run_app git rev-parse "$upstream")"

if [[ "$current" == "$target" ]]; then
  echo "Footato est déjà à jour ($current)."
  exit 0
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$STATE_DIR/$stamp.tar.gz"
stash_created=0
service_stopped=0

rollback() {
  code=$?
  trap - ERR
  echo "Échec du déploiement (code $code), restauration de $current." >&2

  run_app git reset --hard "$current" || true
  if [[ $stash_created -eq 1 ]]; then
    run_app git stash pop --quiet || true
  fi

  if [[ -f "$backup" ]]; then
    tar -xzf "$backup" -C "$APP_DIR" || true
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/dist" 2>/dev/null || true
  fi

  run_app npm ci --silent || true
  systemctl start "$SERVICE" || true
  exit "$code"
}
trap rollback ERR

echo "Nouvelle version Footato : ${current:0:8} -> ${target:0:8}"

# data/ contains the last successful collection; dist/ is the last working
# site. Both are retained independently of Git so a broken release cannot take
# the public site or its freshest data with it.
tar -czf "$backup" data dist

systemctl stop "$SERVICE"
service_stopped=1

# Automatic collections modify versioned snapshots. Stash all tracked output
# before the fast-forward; a successful refresh immediately recreates it from
# the live source, while rollback reapplies it.
if [[ -n "$(run_app git status --porcelain --untracked-files=normal)" ]]; then
  run_app git stash push --include-untracked --message "footato-auto-update-$stamp" --quiet
  stash_created=1
fi

run_app git merge --ff-only "$target"
run_app npm ci --silent

# Full refresh is intentional for a code release: it validates the new code
# against both historical imports and the live Transfermarkt pages before the
# service is exposed again.
run_app npm run refresh:site:full

if [[ $stash_created -eq 1 ]]; then
  run_app git stash drop --quiet
fi

systemctl start "$SERVICE"
service_stopped=0
trap - ERR

# Keep only the five most recent rollback archives.
ls -1t "$STATE_DIR"/*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

echo "Footato déployé : $target"


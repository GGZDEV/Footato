#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "L'installation du minuteur doit être lancée en root." >&2
  exit 1
fi

APP_DIR="${FOOTATO_APP_DIR:-/opt/footato}"

chmod 0755 "$APP_DIR/server/update.sh"
install -m 0644 "$APP_DIR/server/footato-update.service" /etc/systemd/system/footato-update.service
install -m 0644 "$APP_DIR/server/footato-update.timer" /etc/systemd/system/footato-update.timer

systemctl daemon-reload
systemctl enable --now footato-update.timer

echo
echo "Mise à jour automatique activée."
echo "État : systemctl status footato-update.timer"
echo "Journal : journalctl -u footato-update.service -n 100 --no-pager"

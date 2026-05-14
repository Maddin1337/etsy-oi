#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
grafana_bin="${GRAFANA_SERVER_BIN:-}"

if [[ -z "$grafana_bin" ]]; then
  if command -v grafana-server >/dev/null 2>&1; then
    grafana_bin="$(command -v grafana-server)"
  elif [[ -x /usr/sbin/grafana-server ]]; then
    grafana_bin="/usr/sbin/grafana-server"
  else
    echo "grafana-server not found. Install Grafana OSS, then rerun this script." >&2
    exit 127
  fi
fi

state_root="${GRAFANA_STATE_DIR:-/tmp/etsy-oi-grafana}"
mkdir -p "$state_root/data" "$state_root/logs" "$state_root/plugins"

cd "$repo_root"

exec "$grafana_bin" \
  --homepath "${GRAFANA_HOME_PATH:-/usr/share/grafana}" \
  --config "$repo_root/ops/grafana/grafana.ini" \
  cfg:paths.data="$state_root/data" \
  cfg:paths.logs="$state_root/logs" \
  cfg:paths.plugins="$state_root/plugins" \
  cfg:paths.provisioning="$repo_root/ops/grafana/provisioning" \
  cfg:server.http_addr="${GRAFANA_HTTP_ADDR:-127.0.0.1}" \
  cfg:server.http_port="${GRAFANA_PORT:-3000}"


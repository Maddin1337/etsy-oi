# Local Grafana

This folder contains the local Grafana defaults for MCP/observability checks.

## Install

Grafana is not vendored in this repo. Install the Grafana OSS server for the host OS, then start it with the repo config:

```bash
ops/grafana/start-local-grafana.sh
```

The script expects `grafana-server` on `PATH` or at `/usr/sbin/grafana-server`.

## Defaults

- URL: `http://127.0.0.1:3000`
- Admin user: `admin`
- Admin password: `admin`
- Data directory: `/tmp/etsy-oi-grafana/data`
- Logs: `/tmp/etsy-oi-grafana/logs`
- Provisioning: `ops/grafana/provisioning`

The Grafana MCP config on this Hermes host defaults to `http://localhost:3000`, so the local Grafana port intentionally stays on `3000` for MCP verification. If the Vite web app is running on `3000`, stop it or start Grafana with another port and pass the same URL to the MCP server via `GRAFANA_URL`.

## Datasources

Provisioning uses the existing local stack defaults:

- Postgres: `postgres://postgres:postgres@localhost:5432/etsy_oi`
- ClickHouse: `http://localhost:8123`

ClickHouse requires the Grafana ClickHouse datasource plugin to be installed in Grafana. Without that plugin, Grafana starts and the Postgres datasource/dashboard still provision normally.


#!/usr/bin/env bash
# Runs Playwright inside the official image so browser builds and fonts are identical
# locally and in CI (visual baselines are only valid for that environment).
# Expects the built app already listening on localhost:4000 (started with ORIGIN and
# PUBLIC_APP_URL set to http://localhost:4000) and DATABASE_URL pointing at the seeded
# database. Usage: scripts/e2e/run-in-docker.sh [playwright args, e.g. --update-snapshots --project='visual-*']
set -euo pipefail

cd "$(dirname "$0")/../.."

version=$(bun -e "console.log(require('@playwright/test/package.json').version)")
image="mcr.microsoft.com/playwright:v${version}-noble"

net_args=(--network host)
env_args=(-e "DATABASE_URL=${DATABASE_URL}")

if [ "$(docker info --format '{{.OperatingSystem}}')" = "Docker Desktop" ]; then
	# Docker Desktop's host network is its VM, not this machine: reach the app through
	# the host gateway and make the browser resolve "localhost" to it, so the app is
	# still a secure context served from http://localhost:4000.
	gateway_ip=$(docker run --rm --add-host=gw:host-gateway busybox cat /etc/hosts | awk '$2=="gw" && $1 !~ /:/ {print $1}')
	net_args=(--add-host=host.docker.internal:host-gateway)
	env_args=(
		-e "DATABASE_URL=${DATABASE_URL//localhost/host.docker.internal}"
		-e "PW_HOST_MAP_IP=${gateway_ip}"
	)
fi

exec docker run --rm --ipc=host "${net_args[@]}" \
	--user "$(id -u):$(id -g)" \
	-v "$(pwd -P)":/work -w /work \
	-e CI=true \
	-e PW_EXTERNAL_SERVER=1 \
	-e HOME=/tmp \
	"${env_args[@]}" \
	-e PLAYWRIGHT_TEST_BASE_URL="${PLAYWRIGHT_TEST_BASE_URL:-http://localhost:4000}" \
	"$image" node node_modules/@playwright/test/cli.js test "$@"

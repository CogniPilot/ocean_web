#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
args=(-m http.server "${PORT:-8074}" --bind 127.0.0.1 --directory "${SERVE_DIR:-viewer}")
if command -v python3 >/dev/null; then exec python3 "${args[@]}"; fi
exec nix shell nixpkgs#python3 -c python3 "${args[@]}"

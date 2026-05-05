#!/usr/bin/env bash
set -euo pipefail

url="${1:-http://localhost:3000/og.html}"
out="${2:-public/og-image.png}"

agent-browser set viewport 1200 630
agent-browser open "$url"
agent-browser wait 500
agent-browser screenshot "$out"

printf 'Saved %s from %s\n' "$out" "$url"

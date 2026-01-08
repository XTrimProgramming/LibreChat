#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3080}"
TOKEN_FILE="${TOKEN_FILE:-.mcp-token}"
LOGIN_URL="$BASE_URL/api/auth/login"
USER_AGENT="LibreChat-MCP-Test/1.0"
LOGIN_PAYLOAD='{ "email": "admin@librechat.local", "password": "AdminPass123!" }'

if ! command -v curl >/dev/null; then
  echo "ERROR: curl is required"
  exit 1
fi
if ! command -v jq >/dev/null; then
  echo "ERROR: jq is required"
  exit 1
fi

print_status() {
  printf "== %s ==\n" "$1"
}

print_status "Requesting admin token from $LOGIN_URL"
TOKEN_RESPONSE=$(curl -sS -H "Content-Type: application/json" -H "User-Agent: $USER_AGENT" \
  -d "$LOGIN_PAYLOAD" "$LOGIN_URL")
TOKEN=$(printf '%s' "$TOKEN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  printf 'Login response:\n%s\n' "$TOKEN_RESPONSE"
  echo "ERROR: failed to obtain admin token"
  exit 1
fi
printf '\nObtained token and storing in %s\n' "$TOKEN_FILE"
printf '%s' "$TOKEN" > "$TOKEN_FILE"

print_status "Running npm run test:mcp-servers"
LIBRECHAT_TOKEN=$TOKEN npm run test:mcp-servers

#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3080}"
TOKEN_FILE="${TOKEN_FILE:-.mcp-token}"
LOGIN_URL="${LOGIN_URL:-$BASE_URL/api/auth/login}"
USER_AGENT="LibreChat-MCP-Test/1.0"
LOGIN_PAYLOAD='{ "email": "admin@librechat.local", "password": "AdminPass123!" }'
SERVERS="${LIBRECHAT_MCP_SERVERS:-postgres,mcp-clickhouse}"
READY_TIMEOUT=${READY_TIMEOUT:-60}
READY_INTERVAL=${READY_INTERVAL:-5}

check_command() {
  if ! command -v "$1" >/dev/null; then
    echo "ERROR: $1 is required"
    exit 1
  fi
}

obtain_token() {
  echo "Requesting admin token from $LOGIN_URL"
  local response
  response=$(curl -sS -H "Content-Type: application/json" -H "User-Agent: $USER_AGENT" \
    -d "$LOGIN_PAYLOAD" "$LOGIN_URL")
  local token
  token=$(printf '%s' "$response" | jq -r '.token // empty')
  if [ -z "$token" ]; then
    echo "Login response:\n$response"
    echo "ERROR: failed to obtain admin token"
    exit 1
  fi
  printf '%s' "$token" >"$TOKEN_FILE"
  echo "Stored token in $TOKEN_FILE"
  echo
  printf '%s' "$token"
}

wait_for_connections() {
  local token=$1
  local servers
  IFS=',' read -r -a servers <<<"$SERVERS"
  local deadline=$((READY_TIMEOUT / READY_INTERVAL))
  local attempt=1
  while (( attempt <= deadline )); do
    local pending=()
    for server in "${servers[@]}"; do
      local response
      response=$(curl -sS -H "Authorization: Bearer $token" "$BASE_URL/api/mcp/connection/status/$server" || true)
      local state
      state=$(printf '%s' "$response" | jq -r '.connectionStatus // empty')
      if [ "$state" != "connected" ]; then
        pending+=("$server (state=$state)")
      fi
    done
    if [ ${#pending[@]} -eq 0 ]; then
      echo "All MCP servers are connected."
      return 0
    fi
    echo "Waiting for MCP connections to mature (attempt $attempt/$deadline): ${pending[*]}"
    attempt=$((attempt + 1))
    sleep "$READY_INTERVAL"
  done
  echo "ERROR: Some MCP servers never reached connected state: ${pending[*]}"
  return 1
}

check_command curl
check_command jq
check_command npm

if [ -n "${CUSTOM_EMAIL:-}" ] && [ -n "${CUSTOM_PASSWORD:-}" ]; then
  LOGIN_PAYLOAD=$(jq -n --arg email "$CUSTOM_EMAIL" --arg password "$CUSTOM_PASSWORD" '{ email: $email, password: $password }')
fi

TOKEN=$(obtain_token)
wait_for_connections "$TOKEN"

echo "Running npm run test:mcp-servers"
LIBRECHAT_TOKEN="$TOKEN" npm run test:mcp-servers

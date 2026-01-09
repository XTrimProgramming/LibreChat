#!/usr/bin/env bash
set -euo pipefail

CHECKS=(
  "API|curl -fsS http://localhost:3080/api/health"
  "RAG API|curl -fsS http://localhost:8000/health"
  "Keycloak|curl -fsS http://localhost:8080"
  "MongoDB|docker compose exec -T mongodb mongosh --quiet --eval 'db.adminCommand({ping: 1})'"
  "Vector DB|docker compose exec -T vectordb pg_isready -U myuser -d mydatabase"
  "Meilisearch|docker compose exec -T meilisearch curl -fsS http://localhost:7700/health"
  "LDAP|docker compose exec -T ldap ldapsearch -x -H ldap://localhost -s base -b '' dn >/dev/null"
  "ClickHouse|curl -fsS -u default:librechat http://localhost:8123/?query=SELECT+1"
  "MCP ClickHouse|curl -fsS -I http://localhost:8001/sse"
  "Postgres|docker compose exec -T postgres pg_isready -U postgres"
  "MCP Postgres|curl -fsS -I http://localhost:8002/sse"
  "Ollama|curl -fsS http://localhost:11434/api/tags"
)

print_line() { printf "\n== %s ==\n" "$1"; }

for check in "${CHECKS[@]}"; do
  name=${check%%|*}
  cmd=${check#*|}
  print_line "$name"
  if output=$(bash -c "$cmd" 2>&1); then
    echo "✅ $name is healthy"
  else
    echo "❌ $name check failed" >&2
    echo "$output" >&2
    exit 1
  fi
done

print_line "All services"
echo "✅ All health checks passed"

#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const BASE_URL = process.env.LIBRECHAT_BASE_URL || 'http://localhost:3080';
const TOKEN = process.env.LIBRECHAT_TOKEN || process.env.LIBRECHAT_JWT;
const SERVERS = (process.env.LIBRECHAT_MCP_SERVERS || 'postgres,mcp-clickhouse')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.error('Missing LIBRECHAT_TOKEN (or LIBRECHAT_JWT). Obtain an admin JWT and set it before running the script.');
  process.exit(1);
}

if (!SERVERS.length) {
  console.error('No MCP servers were configured in LIBRECHAT_MCP_SERVERS. Provide at least one server name.');
  process.exit(1);
}

async function requestJson(path) {
  const target = new URL(path, BASE_URL);
  const client = target.protocol === 'https:' ? https : http;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
  };

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        method: 'GET',
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers,
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} from ${target}`));
            return;
          }
          if (!buffer) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(buffer));
          } catch (err) {
            reject(new Error(`Failed to parse JSON from ${target}: ${err.message}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log(`Using ${BASE_URL} to validate MCP servers: ${SERVERS.join(', ')}`);
  const allConfig = await requestJson('/api/mcp/servers');
  const serverPayload = allConfig.servers ?? allConfig;
  const normalizedServers = serverPayload && typeof serverPayload === 'object' ? serverPayload : {};
  const configured = Object.keys(normalizedServers);
  const missing = SERVERS.filter((server) => !configured.includes(server));
  if (missing.length) {
    throw new Error(`Expected MCP server(s) ${missing.join(', ')} to exist in configuration`);
  }

  const statuses = await Promise.all(
    SERVERS.map(async (server) => {
      const response = await requestJson(`/api/mcp/connection/status/${server}`);
      const state = response.connectionStatus;
      if (!response.success) {
        throw new Error(`MCP server ${server} responded with success=false`);
      }
      return { server, state, requiresOAuth: response.requiresOAuth };
    }),
  );

  let failures = 0;
  for (const status of statuses) {
    const healthy = status.state === 'connected';
    console.log(`- ${status.server}: ${status.state}${healthy ? '' : ' (not connected yet)'}`);
    if (!healthy) {
      failures += 1;
    }
  }

  if (failures > 0) {
    throw new Error('At least one MCP server is not connected via the Model Context Protocol');
  }

  console.log('All configured MCP servers are connected.');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('MCP validation failed:', error.message);
    process.exit(1);
  });

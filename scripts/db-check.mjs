#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseDbInfo(databaseUrl) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? '(default)';
  const sslmode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'not-set';
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, '') || '(unknown)',
    schema,
    sslmode,
    username: decodeURIComponent(url.username || ''),
  };
}

function tcpCheck(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, `TCP connect OK to ${host}:${port}`));
    socket.once('timeout', () => done(false, `Timed out connecting to ${host}:${port}`));
    socket.once('error', (err) => done(false, err.message));
    socket.connect(port, host);
  });
}

const cwd = process.cwd();
const productionEnvPath = path.join(cwd, '.env.production.local');
if (fs.existsSync(productionEnvPath)) {
  loadDotEnv(productionEnvPath);
} else {
  loadDotEnv(path.join(cwd, '.env'));
  loadDotEnv(path.join(cwd, '.env.local'));
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DB CHECK: FAIL');
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

let info;
try {
  info = parseDbInfo(databaseUrl);
} catch (err) {
  console.error('DB CHECK: FAIL');
  console.error(`DATABASE_URL is not parseable: ${err.message}`);
  process.exit(1);
}

console.log('DB CHECK: INFO');
console.log(`- protocol: ${info.protocol}`);
console.log(`- host: ${info.host}`);
console.log(`- port: ${info.port}`);
console.log(`- database: ${info.database}`);
console.log(`- schema: ${info.schema}`);
console.log(`- sslmode: ${info.sslmode}`);
console.log(`- username: ${info.username || '(empty)'}`);

const tcp = await tcpCheck(info.host, info.port);
if (!tcp.ok) {
  console.error('DB CHECK: FAIL');
  console.error(`Network reachability failed: ${tcp.detail}`);
  process.exit(2);
}

console.log('DB CHECK: PASS');
console.log(tcp.detail);

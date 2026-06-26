#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

loadDotEnvWithoutOverridingProcess();
assertOpenBoxEnv();

const result = spawnSync(
  'npx',
  ['@langchain/langgraph-cli@1.2.1', 'dev', '--port', '8123', '--no-browser'],
  {
    cwd: join(ROOT_DIR, 'agent'),
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);

function loadDotEnvWithoutOverridingProcess() {
  const explicitEnv = new Set(Object.keys(process.env));
  for (const file of ['.env.openbox', '.env']) {
    const path = join(ROOT_DIR, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || explicitEnv.has(key)) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

function assertOpenBoxEnv() {
  if (process.env.OPENBOX_ENABLED === "false") return;
  const missing = [
    "OPENBOX_ENABLED",
    "OPENBOX_API_URL",
    "OPENBOX_CORE_URL",
    "OPENBOX_API_KEY",
    "OPENBOX_AGENT_ID",
    "OPENBOX_AGENT_DID",
    "OPENBOX_AGENT_PRIVATE_KEY",
  ].filter((key) => !process.env[key]);
  if (missing.length === 0) return;

  console.error(
    `[openbox-demo] Missing required OpenBox env: ${missing.join(", ")}`,
  );
  console.error(
    "[openbox-demo] Set them in .env.openbox or .env before running the governed demo.",
  );
  process.exit(1);
}

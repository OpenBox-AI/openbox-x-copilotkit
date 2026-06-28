#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

loadDotEnvWithoutOverridingProcess();
assertOpenBoxEnv();
pruneOversizedLanggraphState();

// The access-grant store uses node:sqlite, which is experimental on Node 22
// (stable on Node 24+). Propagate the flag through NODE_OPTIONS so the graph
// process the langgraph-cli spawns can load node:sqlite. Harmless on Node 24+.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--experimental-sqlite']
  .filter(Boolean)
  .join(' ');

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

// The langgraph dev FileSystemPersistence appends every thread's checkpoints
// into one .langgraph_api/.langgraphjs_api.checkpointer.json and never prunes.
// Each checkpoint carries the full message history + the large A2UI app context,
// so over a long session the file grows until JSON.stringify of it throws
// `RangeError: Invalid string length` (the ~512MB / 2^29-char limit) on persist,
// which kills the agent mid-run. Wipe the local dev state when it gets close to
// that limit so the agent can't crash on it. This is throwaway dev state (each
// new chat is a fresh thread); we keep it under the threshold rather than wiping
// every start so normal thread history survives ordinary restarts.
function pruneOversizedLanggraphState() {
  const MAX_BYTES = 200 * 1024 * 1024; // 200MB — well under the ~512MB string cap
  const stateDir = join(ROOT_DIR, 'agent', '.langgraph_api');
  const checkpointer = join(stateDir, '.langgraphjs_api.checkpointer.json');
  try {
    if (statSync(checkpointer).size <= MAX_BYTES) return;
  } catch {
    return; // no state file yet — nothing to prune
  }
  console.warn(
    '[openbox-demo] langgraph dev state exceeded 200MB; clearing .langgraph_api to avoid the RangeError persist crash.',
  );
  rmSync(stateDir, { recursive: true, force: true });
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

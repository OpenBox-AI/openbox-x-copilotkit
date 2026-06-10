#!/usr/bin/env -S node --experimental-strip-types
import { spawn } from 'node:child_process';

type Child = ReturnType<typeof spawn>;
type ExtraEnv = Record<string, string | undefined>;

function start(command: string, args: string[], options: { cwd?: string; env?: ExtraEnv } = {}): Child {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } as NodeJS.ProcessEnv : process.env,
    stdio: 'inherit',
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exitOnFirst(child: Child, name: string): Promise<number> {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      if (signal) process.stdout.write(`[entrypoint] ${name} exited on ${signal}\n`);
      resolve(code ?? 1);
    });
  });
}

function stop(children: Child[]): void {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.stdout.write('[entrypoint] Starting: langgraph-js starter\n');
process.stdout.write(process.env.OPENAI_API_KEY
  ? '[entrypoint] OPENAI_API_KEY: set\n'
  : '[entrypoint] WARNING: OPENAI_API_KEY not set!\n');

process.stdout.write('[entrypoint] Starting agent on port 8123...\n');
const agent = start(
  'npx',
  ['--yes', '@langchain/langgraph-cli', 'dev', '--host', '0.0.0.0', '--port', '8123', '--no-browser'],
  { cwd: '/app/agent', env: { AGENT_PORT: '8123' } },
);

await wait(3000);

const port = process.env.PORT || '3000';
process.stdout.write(`[entrypoint] Starting Next.js on port ${port}...\n`);
const next = start('node', ['server.js'], {
  cwd: '/app',
  env: {
    HOSTNAME: '0.0.0.0',
    PORT: port,
  },
});

process.stdout.write(`[entrypoint] Agent=${agent.pid ?? 'unknown'} Next=${next.pid ?? 'unknown'}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stop([agent, next]);
  });
}

const exitCode = await Promise.race([
  exitOnFirst(agent, 'agent'),
  exitOnFirst(next, 'next'),
]);
stop([agent, next]);
process.exit(exitCode);

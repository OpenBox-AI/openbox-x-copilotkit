# Contributing to OpenBox x CopilotKit

This repo is a runnable CopilotKit + LangGraph example for OpenBox
governance. Keep changes focused on making the demo clearer, safer, and
easier to run locally.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Useful checks before opening a PR:

```bash
npm run build
npx tsc --noEmit
cd agent && npx tsc --noEmit
```

Maintainer checks that call real OpenBox services:

```bash
npm run openbox:verify
npm run openbox:e2e
```

`npm run openbox:admin:setup` mutates the configured OpenBox agent and
is not part of normal contributor verification.

## Change Boundaries

Use the root app for CopilotKit UI/runtime integration and the `agent/`
package for LangGraph agent behavior. Keep demo data, scenario wording,
and governance examples realistic enough to exercise OpenBox behavior
without committing secrets or real customer data.

When changing environment variables, update `.env.example` and
`README.md` in the same PR.

## Commit Conventions

Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`,
etc.). Messages should explain why the change exists; the diff already
shows what changed.

## Filing Issues and PRs

For non-trivial behavior changes, open an issue first or describe the
intended demo path clearly in the PR. Include the checks you ran, and
redact API keys, runtime keys, DIDs, private keys, and backend URLs from
logs.

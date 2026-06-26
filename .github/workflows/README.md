# `.github/workflows/`

| Workflow | Triggers | Purpose |
|---|---|---|
| `pr-governance.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Branch, PR title, optional commit convention, and sensitive path ownership checks |
| `pr-quality.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Install root and agent dependencies, lint, typecheck, build, upload build artifacts, and optional SonarQube |
| `pr-security.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Trivy filesystem scan and Gitleaks secret scan with SARIF artifacts |

## Required Repo Secrets

No secrets are required for the default PR workflows. Live OpenBox
verification and Playwright e2e runs require the environment variables
documented in `.env.example` and `README.md`.

This repository is a POC app, not an npm package. It has no publish workflow.

## Optional Repo Secrets

| Secret | Used by | Notes |
|---|---|---|
| `SONAR_HOST_URL` | `pr-quality.yml` | Optional SonarQube server URL |
| `SONAR_TOKEN` | `pr-quality.yml` | Optional token for SonarQube analysis |

## Optional Repo Variables

| Variable | Used by | Notes |
|---|---|---|
| `ENFORCE_COMMIT_CONVENTION` | `pr-governance.yml` | Set to `true` to validate every commit subject on PRs |

## Live Verification

`npm run openbox:verify` and `npm run openbox:e2e` call real OpenBox and
model-provider services. Keep them manual until the required CI
environment is configured.

# `.github/workflows/`

| Workflow | Triggers | Purpose |
|---|---|---|
| `publish.yml` | semver tag push, `workflow_dispatch` | Release governance, quality, security, optional SonarQube, npm packing, and OIDC npm publish |
| `pr-governance.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Branch, PR title, optional commit convention, and sensitive path ownership checks |
| `pr-quality.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Install root and agent dependencies, lint, typecheck, build, and upload build artifacts |
| `pr-security.yml` | push to `main`, PR to `main`, `workflow_dispatch` | Trivy filesystem scan and Gitleaks secret scan with SARIF artifacts |
| `test.yml` | `workflow_dispatch` | Manual verification entry point for the same quality checks plus optional OpenBox live checks |

## Required Repo Secrets

No secrets are required for the default PR workflows. Live OpenBox
verification and Playwright e2e runs require the environment variables
documented in `.env.example` and `README.md`.

`publish.yml` uses npm trusted publishing with `id-token: write`. Configure
the npm package trusted publisher for this repository, workflow, and the
`npm` environment.

## Optional Repo Variables

| Variable | Used by | Notes |
|---|---|---|
| `ENFORCE_COMMIT_CONVENTION` | `pr-governance.yml` | Set to `true` to validate every commit subject on PRs |

## Live Verification

`npm run openbox:verify` and `npm run openbox:e2e` call real OpenBox and
model-provider services. Keep them manual until the required CI
environment is configured.

# Security Policy

## Supported Versions

Security fixes ship on the latest version of this demo. Older commits do
not receive backports.

## Reporting a Vulnerability

Report security issues privately via GitHub's
[Report a vulnerability](https://github.com/OpenBox-AI/openbox-x-copilotkit/security/advisories/new)
flow. Do not open a public issue.

What to include:

- A short description of the issue and its impact.
- Reproduction steps or a proof of concept against a recent commit.
- Runtime details: Node version, OS, browser, `openbox-sdk` package ref,
  and whether the issue appears in the Next app, LangGraph agent, or
  OpenBox service integration.

We aim to acknowledge reports within 5 business days. Reports that turn
out to be misuse or non-vulnerabilities will be closed with a brief note.

## Out of Scope

- Findings that require running attacker-controlled local code.
- Issues in unrelated services or dependencies. Report those upstream.
- Reports that only expose values already committed as demo data.
- Social-engineering scenarios that require a maintainer to paste
  attacker-supplied code into a privileged shell.

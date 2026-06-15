# OpenBox x CopilotKit

Minimal CopilotKit + LangGraph example using `@openbox-ai/openbox-sdk/copilotkit`.

The app runs locally. CopilotKit and LangGraph handle the agent UI/runtime.
OpenBox Core makes governance decisions. The OpenBox decision card renders above
the CopilotKit business result.

## Install

```bash
cp .env.example .env
npm install
```

The example uses the published `@openbox-ai/openbox-sdk` package from npm.

## Configure

Required:

```bash
OPENAI_BASE_URL=https://openai-compatible-provider.example/v1
OPENAI_MODEL=your-chat-model
OPENAI_API_KEY=your_model_provider_key

OPENBOX_ENABLED=true
OPENBOX_CORE_URL=https://core.example.com
OPENBOX_API_KEY=obx_live_or_obx_test_agent_runtime_key
OPENBOX_AGENT_ID=openbox_agent_id
```

If the OpenBox agent requires signing:

```bash
OPENBOX_AGENT_DID=did:aip:...
OPENBOX_AGENT_PRIVATE_KEY=base64_raw_ed25519_private_key
```

Optional, only for inline approval decisions and maintainer verification:

```bash
OPENBOX_API_URL=https://api.example.com
OPENBOX_BACKEND_API_KEY=obx_key_org_or_backend_api_key
```

## Run

```bash
npm run dev
```

Default local services:

- LangGraph agent: `http://localhost:8123`
- Next app: the port printed by Next

For the fixed demo port:

```bash
npm run dev:agent
AGENT_URL=http://localhost:8123 npm run dev:ui -- -p 3001
```

Open `http://localhost:3001`.

## Try

Use the suggestion chips or type normal business requests:

| Prompt | Expected OpenBox path |
| --- | --- |
| Review Work Queue | allow |
| Prepare Exception Report | output redaction |
| Draft Customer Update | final output governance |
| Prepare Vendor Handoff | interactive choice, then governance |
| Draft Billing Escalation | manual edit, then governance |
| Issue Service Credit | human approval |
| Send Exception IDs | block |
| Update Vendor Bank | halt |

## Verify

Fast local checks:

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

`npm run openbox:admin:setup` mutates the configured OpenBox agent and is not
part of the normal demo path.

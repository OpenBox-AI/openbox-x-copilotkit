import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import {
  createOpenBoxCopilotKitAdapter,
  createOpenBoxGovernedRunner,
  createOpenBoxRuntimeHooks,
} from "@openbox-ai/openbox-sdk/copilotkit";

// Capture mode (canonical LLM spanning): the assistant gate emits the full
// started+completed llm_completion pair from the real provider exchange, and the
// prompt gate's reconstructed started span is suppressed to avoid a duplicate.
// Raw headers mirror the canonical prod-data capture fidelity.
process.env.OPENBOX_LLM_SPANS_FROM_CAPTURE ??= "true";
process.env.OPENBOX_CAPTURE_RAW_HEADERS ??= "true";

const CORE_TIMEOUT_MS = 180_000;
const LANGGRAPH_STREAM_MODE = [
  "events",
  "values",
  "updates",
  "messages-tuple",
  "custom",
] as const;

class OpenBoxLangGraphAgent extends LangGraphAgent {
  run(input: Parameters<LangGraphAgent["run"]>[0]) {
    return super.run({
      ...input,
      forwardedProps: {
        ...input.forwardedProps,
        streamMode: LANGGRAPH_STREAM_MODE,
      },
    });
  }
}

const defaultAgent = new OpenBoxLangGraphAgent({
  deploymentUrl:
    process.env.AGENT_URL ||
    process.env.LANGGRAPH_DEPLOYMENT_URL ||
    "http://localhost:8123",
  graphId: "openbox_copilotkit_agent",
  langsmithApiKey: process.env.LANGSMITH_API_KEY || "",
});

// One OpenBox adapter backs BOTH the governed runner (governs the agent event
// stream) and the runtime hooks (govern the request boundary), so they share a
// single Core client + config.
const openboxAdapter = createOpenBoxCopilotKitAdapter({
  agentWorkflowType: "CopilotKitRuntime",
  taskQueue: "copilotkit-runtime",
  selfGovernedToolNames: [
    "openbox_governed_action",
    "openbox_governed_approval_action",
    "openbox_resume_governed_action",
  ],
  clientName: "openbox-copilotkit-demo",
  coreTimeoutMs: CORE_TIMEOUT_MS,
});

// Construct-time governance injection: wrap the base runner and pass the GOVERNED
// runner straight into the CopilotRuntime constructor's supported `runner` option
// — instead of post-hoc shadowing runtime.runner. This removes the getter-shadow
// that could be bypassed if the handler read the runtime's internal runner field.
// The langgraph agent runs the OpenBox middleware, so it owns the llm_call
// assistant gate (with the real captured exchange); assistantOutputOwner:"agent"
// tells the runtime to stream the agent's already-governed output rather than
// re-governing it (single-owner split, no double-governance).
const governedRunner = createOpenBoxGovernedRunner(new InMemoryAgentRunner(), {
  adapter: openboxAdapter,
  agents: ["default"],
  assistantOutputOwner: "agent",
});

const runtime = new CopilotRuntime({
  agents: { default: defaultAgent },
  runner: governedRunner as any,
  a2ui: {
    injectA2UITool: false,
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  hooks: createOpenBoxRuntimeHooks({
    adapter: openboxAdapter,
    agents: ["default"],
  }) as any,
});

export const GET = handler;
export const POST = handler;

import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import {
  createOpenBoxCopilotKitAdapter,
  createOpenBoxCopilotRuntime,
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

const runner = new InMemoryAgentRunner();
const runtime = new CopilotRuntime({
  agents: { default: defaultAgent },
  runner,
  a2ui: {
    injectA2UITool: false,
  },
});
const openboxRuntime = createOpenBoxCopilotRuntime({
  runtime,
  runner: runner as any,
  agents: ["default"],
  // The langgraph agent runs the OpenBox LangChain middleware, so it owns the
  // llm_call assistant gate (with the real captured exchange). Tell the runtime
  // to stream the agent's already-governed output instead of re-evaluating it —
  // single-owner split, no assistant-output double-governance.
  assistantOutputOwner: "agent",
  adapter: createOpenBoxCopilotKitAdapter({
    agentWorkflowType: "CopilotKitRuntime",
    taskQueue: "copilotkit-runtime",
    selfGovernedToolNames: [
      "openbox_governed_action",
      "openbox_governed_approval_action",
      "openbox_resume_governed_action",
    ],
    clientName: "openbox-copilotkit-demo",
    coreTimeoutMs: CORE_TIMEOUT_MS,
  }),
});

const handler = createCopilotRuntimeHandler({
  runtime: openboxRuntime.runtime as any,
  basePath: "/api/copilotkit",
  hooks: openboxRuntime.hooks as any,
});

export const GET = handler;
export const POST = handler;

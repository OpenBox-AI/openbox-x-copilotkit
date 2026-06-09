import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import {
  createOpenBoxCopilotKitAdapter,
  createOpenBoxCopilotRuntime,
} from "openbox-sdk/copilotkit";

const CORE_TIMEOUT_MS = 180_000;

const defaultAgent = new LangGraphAgent({
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

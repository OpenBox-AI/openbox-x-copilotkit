import { AIMessage } from "@langchain/core/messages";
import { createMiddleware, type AgentMiddleware } from "langchain";
import { OpenBoxCoreClient } from "@openbox-ai/openbox-sdk";
import {
  createOpenBoxCopilotKitAdapter,
  OpenBoxCopilotKitError,
} from "@openbox-ai/openbox-sdk/copilotkit";

// Demo parity: store the real captured provider headers/body verbatim in
// llm_completion spans (no redaction) and let the captured span be authoritative.
process.env.OPENBOX_CAPTURE_RAW_HEADERS ??= "true";
process.env.OPENBOX_LLM_SPANS_FROM_CAPTURE ??= "true";

const WORKFLOW_TYPE = "CopilotKitLangGraphAgent";
const TASK_QUEUE = "copilotkit-langgraph";
const CORE_TIMEOUT_MS = 180_000;
const SELF_GOVERNED_OPENBOX_TOOLS = new Set([
  "openbox_governed_action",
  "openbox_governed_approval_action",
  "openbox_resume_governed_action",
]);
const DEFAULT_HANDOFF_FIELDS = ["summary", "timeline"];
const GROWTH_HANDOFF_FIELDS = [
  "summary",
  "service_tier",
  "timeline",
  "owner_note",
  "impact",
];
const SENSITIVE_HANDOFF_FIELDS = [
  "summary",
  "service_tier",
  "timeline",
  "owner_note",
  "source_value",
  "internal_context",
];
const DEFAULT_MANUAL_ESCALATION_DRAFT =
  "Please escalate the failed invoice resend to billing operations and confirm the next customer-safe update.";

export class OpenBoxGovernanceError extends OpenBoxCopilotKitError {}

export const openBoxCopilotKitAdapter = createOpenBoxCopilotKitAdapter({
  agentWorkflowType: WORKFLOW_TYPE,
  taskQueue: TASK_QUEUE,
  selfGovernedToolNames: SELF_GOVERNED_OPENBOX_TOOLS,
  clientName: "openbox-copilotkit-demo",
  coreTimeoutMs: CORE_TIMEOUT_MS,
});

export function createOpenBoxGovernanceMiddleware(): AgentMiddleware {
  return openBoxCopilotKitAdapter.createLangChainMiddleware({
    createMiddleware,
    AIMessage,
    routeLatestUserPrompt: routeOpenBoxDemoPrompt,
  }) as AgentMiddleware;
}

export function isOpenBoxEnabled(): boolean {
  return openBoxCopilotKitAdapter.isEnabled();
}

export function getCoreClient(): OpenBoxCoreClient {
  return openBoxCopilotKitAdapter.getCoreClient();
}

function routeOpenBoxDemoPrompt(messages: unknown[]) {
  const latestInteractiveResponse = latestOpenBoxInteractiveResponse(messages);
  if (latestInteractiveResponse) {
    return {
      toolName: "openbox_governed_action",
      args: latestInteractiveResponse,
    };
  }

  const latestUserRequest = latestUserRequestText(messages);
  if (!latestUserRequest) {
    return undefined;
  }

  if (isBillingEscalationDraftRequest(latestUserRequest)) {
    return {
      toolName: "openboxInteractiveReview",
      args: {
        mode: "manual",
        title: "Billing Escalation Draft",
        action: "submit_manual_request",
        request: latestUserRequest,
        destination: "OpenBox operations",
        sensitivity: "internal",
        manualInput: DEFAULT_MANUAL_ESCALATION_DRAFT,
      },
    };
  }

  if (isServiceCreditRequest(latestUserRequest)) {
    return {
      toolName: "openbox_governed_approval_action",
      args: {
        action: "issue_large_refund",
        request: latestUserRequest,
        destination: "approved customer account",
        amountUsd: amountUsdFromRequest(latestUserRequest) ?? 7500,
      },
    };
  }

  if (isVendorBankRequest(latestUserRequest)) {
    return {
      toolName: "openbox_governed_action",
      args: {
        action: "disable_production_payments",
        request: latestUserRequest,
        destination: "production payment batch",
        sensitivity: "restricted",
      },
    };
  }

  if (!isVendorHandoffRequest(latestUserRequest)) {
    return undefined;
  }

  const choiceId = handoffChoiceFromRequest(latestUserRequest);
  return {
    toolName: "openboxInteractiveReview",
    args: {
      mode: "choice",
      title: "Vendor Review Handoff",
      action: "review_data_handoff",
      request: latestUserRequest,
      destination: "External review workspace",
      fields: handoffFields(choiceId),
      audience: "External reviewer",
      choiceId,
      sensitivity: "internal",
    },
  };
}

function latestOpenBoxInteractiveResponse(
  messages: unknown[],
): Record<string, unknown> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = objectRecord(messages[index]);
    const response = openBoxInteractiveResponse(message);
    if (response) return response;
    if (hasOpenBoxGovernedActionAfterInteractive(message) || isOpenBoxResult(message)) {
      return undefined;
    }
    const role = messageRole(message);
    if (role === "human" || role === "user") return undefined;
  }
  return undefined;
}

function openBoxInteractiveResponse(message: unknown): Record<string, unknown> | undefined {
  const record = objectRecord(message);
  if (messageRole(record) !== "tool") return undefined;

  const parsed = parseContent(record.content);
  if (!parsed) return undefined;
  const mustCallGovernedAction =
    parsed.mustCallOpenBoxGovernedAction === true ||
    parsed.nextTool === "openbox_governed_action";
  if (!mustCallGovernedAction) return undefined;

  const action = stringValue(parsed.action);
  const request = stringValue(parsed.request);
  if (!action || !request) return undefined;
  const choiceId = handoffChoiceFromValue(parsed.choiceId);
  const fields = nonEmptyStringArray(parsed.fields) ??
    (action === "review_data_handoff" ? handoffFields(choiceId ?? "minimal") : undefined);

  return compactObject({
    action,
    request,
    destination: stringValue(parsed.destination),
    fields,
    audience: stringValue(parsed.audience) ??
      (action === "review_data_handoff" ? "External reviewer" : undefined),
    manualInput: stringValue(parsed.manualInput) ??
      (action === "submit_manual_request" ? request : undefined),
    sensitivity: stringValue(parsed.sensitivity),
    choiceId,
  });
}

function latestUserRequestText(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = objectRecord(messages[index]);
    if (messageRole(message) !== "human" && messageRole(message) !== "user") {
      continue;
    }
    const text = contentText(message.content);
    if (text) return text;
  }
  return undefined;
}

function isVendorHandoffRequest(request: string): boolean {
  const text = request.toLowerCase();
  return (
    /\b(vendor[-\s]?review|external evidence|data handoff|handoff)\b/.test(text) &&
    /\b(prepare|create|draft|package|workspace|external)\b/.test(text)
  );
}

function isBillingEscalationDraftRequest(request: string): boolean {
  const text = request.toLowerCase();
  return (
    /\b(billing escalation|support escalation|escalation note|failed invoice resend)\b/.test(text) ||
    (/\b(let me edit|edit it before sending|user-edited|manual)\b/.test(text) &&
      /\b(draft|note|request)\b/.test(text))
  );
}

function isServiceCreditRequest(request: string): boolean {
  const text = request.toLowerCase();
  return (
    /\b(issue|process|create|record)\b/.test(text) &&
    /\b(service credit|credit memo|refund|payout|invoice write-off)\b/.test(text)
  );
}

function isVendorBankRequest(request: string): boolean {
  const text = request.toLowerCase();
  return (
    /\b(vendor bank|bank details|bank account|payment batch)\b/.test(text) &&
    /\b(update|change|release|production payment|payment-control)\b/.test(text)
  );
}

function handoffChoiceFromRequest(request: string): "minimal" | "growth" | "sensitive" {
  const text = request.toLowerCase();
  if (/\b(full internal|raw|source|identifier|session|workflow)\b/.test(text)) {
    return "sensitive";
  }
  if (/\b(operational|growth|impact|service impact|expansion)\b/.test(text)) {
    return "growth";
  }
  return "minimal";
}

function handoffChoiceFromValue(value: unknown): "minimal" | "growth" | "sensitive" | undefined {
  return value === "minimal" || value === "growth" || value === "sensitive"
    ? value
    : undefined;
}

function handoffFields(choiceId: "minimal" | "growth" | "sensitive"): string[] {
  if (choiceId === "growth") return GROWTH_HANDOFF_FIELDS;
  if (choiceId === "sensitive") return SENSITIVE_HANDOFF_FIELDS;
  return DEFAULT_HANDOFF_FIELDS;
}

function amountUsdFromRequest(request: string): number | undefined {
  const match = request.match(/\$?\s*([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.(\d{1,2}))?\s*(k)?\b/i);
  if (!match) return undefined;
  const whole = Number(match[1]?.replace(/,/g, ""));
  if (!Number.isFinite(whole) || whole <= 0) return undefined;
  const cents = match[2] ? Number(`0.${match[2]}`) : 0;
  const multiplier = match[3] ? 1000 : 1;
  return (whole + cents) * multiplier;
}

function messageRole(message: Record<string, unknown>): string {
  const value = message.role ?? message.type;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function hasOpenBoxGovernedActionAfterInteractive(message: Record<string, unknown>): boolean {
  const toolCalls = Array.isArray(message.toolCalls)
    ? message.toolCalls
    : Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
  return toolCalls.some((toolCall) => {
    const record = objectRecord(toolCall);
    const fn = objectRecord(record.function);
    return (
      record.name === "openbox_governed_action" ||
      fn.name === "openbox_governed_action"
    );
  });
}

function isOpenBoxResult(message: Record<string, unknown>): boolean {
  const parsed = parseContent(message.content);
  return parsed?.schemaVersion === "openbox.copilotkit.result.v1";
}

function contentText(content: unknown): string | undefined {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || undefined;
  }
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      const record = objectRecord(part);
      return stringValue(record.text) || stringValue(record.content);
    })
    .filter(Boolean)
    .join(" ")
    .trim();
  return text || undefined;
}

function parseContent(content: unknown): Record<string, unknown> | undefined {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      const record = objectRecord(part);
      const parsed = parseContent(record.text ?? record.content);
      if (parsed) return parsed;
    }
    return undefined;
  }
  if (typeof content !== "string") return undefined;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function nonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
  return strings.length ? strings : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

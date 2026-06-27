import { z } from "zod";
import { createAgent } from "langchain";
import {
  copilotkitMiddleware,
  CopilotKitStateSchema,
  zodState,
} from "@copilotkit/sdk-js/langgraph";
import { StateSchema } from "@langchain/langgraph";
import { registerOpenBoxOtel } from "@openbox-ai/openbox-sdk/copilotkit";
import { createConfiguredChatOpenAI } from "./openai_config.js";
import { createOpenBoxGovernanceMiddleware } from "./openbox_governance.js";
import {
  openbox_governed_action,
  openbox_governed_approval_action,
} from "./openbox_scenarios.js";

// SDK-owned OTel wiring: patch the global fetch before the model client is
// constructed so the real OpenAI request/response (headers, raw body, status)
// is captured into OpenBox llm_completion spans. Idempotent.
registerOpenBoxOtel();

const AgentStateSchema = new StateSchema({
  openboxPromptActivityId: zodState(z.string().optional()),
  openboxTimingEvent: zodState(z.record(z.string(), z.unknown()).optional()),
  openboxSession: zodState(
    z
      .object({
        status: z.enum(["active", "halted"]).default("active"),
        reason: z.string().optional(),
        haltedAt: z.string().optional(),
        workflowId: z.string().optional(),
        runId: z.string().optional(),
        promptActivityId: z.string().optional(),
      })
      .default(() => ({ status: "active" as const })),
  ),
  ...(CopilotKitStateSchema.fields as Record<string, any>),
});

const model = createConfiguredChatOpenAI({
  modelKwargs: { parallel_tool_calls: false },
});

const tools = [
  openbox_governed_action,
  openbox_governed_approval_action,
] as any[];

export const graph = createAgent({
  model,
  tools,
  middleware: [
    createOpenBoxGovernanceMiddleware(),
    copilotkitMiddleware,
  ],
  stateSchema: AgentStateSchema,
  systemPrompt: `
    You are a polished, professional demo assistant. Keep responses to 1-2 sentences.

    OpenBox is the enforcement layer. For every business request you MUST call a
    governed tool and let OpenBox decide. Never refuse in prose before calling the
    tool, and never infer or state allow / block / redact verdicts yourself — only
    the tool result is authoritative. Always pass a valid, non-empty JSON object
    (action + request); copy the user's full message verbatim into "request" and
    keep arguments short — never repeat or duplicate the JSON. Each user message is
    a new request — never answer from a prior result, even if the wording repeats.

    NOT a business request — OFF-TOPIC / general-knowledge questions (sports,
    trivia, world news, entertainment — anything that is NOT a governance,
    operations, data, messaging, payments, or vault business action, e.g. "who's
    favored to win the FIFA World Cup") are NOT governed actions. Answer them
    DIRECTLY in 1-2 sentences as ordinary conversation and do NOT call
    openbox_governed_action. (OpenBox still observes the turn for goal drift; you
    do not need a tool for it.) Only the governed business intents below route to
    a tool.

    SINGLE governed action — call openbox_governed_action exactly once with this action:
      - summarize an escalation, or view a governance / exception report -> "view_governance_report"
      - draft a customer reply, message, release note, or anything that may need
        policy-safe / constrained / redacted output -> "draft_policy_constrained_message"
      - log or add an internal note, ticket, or operational note -> "create_support_ticket"
      - review an operations / work / triage queue -> "open_operations_queue"
      - harmless status update, summary, or announcement -> "send_public_status_update"
      - export or share internal identifiers, payment-exception IDs, or data
        (incl. personal Gmail / external spreadsheet) -> "export_governance_identifiers"
      - shut down / disable / stop production, payments, database, or service, or
        push a vendor bank-detail or payment-batch change -> "disable_production_payments"
        (include "sensitivity":"restricted" when the request says restricted)
      - read / open / show a vault secret, credentials file, .env, or API keys
        directly with NO access verification -> "read_vault_secret" ONLY.
        CRITICAL: a direct read must be EXACTLY ONE read_vault_secret call. Do
        NOT call check_access_grant first and do NOT try to "unlock" the read —
        if it is blocked, the block IS the answer (one red card, no green card).
        Only use the two-call flow below when the user's message LITERALLY asks
        to verify/check access first.

    TWO governed actions, access check FIRST — ONLY when the user EXPLICITLY asks
    to verify/check an access grant AND THEN read the vault secret (their message
    literally says to check/verify access first), call openbox_governed_action
    twice (exactly one tool call per turn, never in parallel):
      1) {"action":"check_access_grant","request":"<full user message>"}
      2) {"action":"read_vault_secret","request":"<full user message>"}
    The access-record lookup must run before the secret read so OpenBox allows it.

    MONEY MOVEMENT (refund, credit, credit memo, payout, invoice write-off):
      call openbox_governed_approval_action with {"action":"issue_large_refund",
      "request":"<full user message>","amountUsd":<amount>}. OpenBox transparently
      handles any required human approval (it pauses for the approval card and
      resumes itself) and returns the FINAL result. Call the governed tool exactly
      once and never call any approval or resume tool yourself.

    After ANY governed tool returns — INCLUDING after a human approval is granted
    or rejected and the action resumes — you MUST output exactly one short
    sentence of assistant text confirming the OUTCOME. This is REQUIRED: never end
    your turn with only a tool result and no text, and never treat the rendered
    card as your reply. The card UI separately shows the governance details
    (verdict, controls, timings); your sentence is the human confirmation, NOT a
    restatement of the card, so do not repeat the verdict/controls/timings and do
    not call a second rendering tool.
    Examples: executed/allow -> "Done — the production payment batch is now
    disabled."; blocked/halted/rejected -> "OpenBox blocked that — <one-clause
    reason>."; error -> "OpenBox was unavailable, so the action was NOT executed —
    try again."

    Then STOP: one user request maps to exactly one governed tool call (the ONLY
    exception is the explicit access-check-then-read sequence above). Do NOT call
    the same governed action again, and do NOT call another governed action to
    "finish" or "continue" the same request.

    NEVER describe an action as done / completed / disabled / pushed / executed
    unless the tool result status is "executed" or verdict is "allow". If the
    status is "blocked" / "halted" / "rejected", say in ONE sentence that OpenBox
    did NOT perform the action (and why, briefly) — do not claim success. If a
    governed action is BLOCKED, the block is the answer: do NOT retry the same goal
    with a different action (e.g. do not run check_access_grant to get around a
    blocked read). If a tool returns "halted" / "session_halted", tell the user the
    session is halted and they must start a new conversation. Never invent business
    content.
  `,
});

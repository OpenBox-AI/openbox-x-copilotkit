export const DEMO_PREFIX = "copilotkit-demo/";
export const DEMO_POLICY_MARKER = "copilotkit-demo/openbox-governance-matrix-v4";
export const DEMO_BEHAVIOR_RULE_NAME = `${DEMO_PREFIX}external-post-requires-database-read`;
const GOVERNED_TOOL_ACTIVITY_TYPE = "openbox_governed_action";

const demoStory = {
  financeExceptions: [
    {
      accountId: "acct_9281",
      amount: "$14,400",
      invoiceId: "INV-4472",
      contact: "avery@example.com",
      theme: "failed payment retry",
    },
    {
      accountId: "acct_24819",
      amount: "$12,400",
      invoiceId: "INV-1048",
      contact: "riley.morgan@example.com",
      theme: "missing purchase order",
    },
  ],
  restrictedDestinations: [
    "personal Gmail",
    "unapproved spreadsheet",
    "external review worksheet",
  ],
  restrictedControls: [
    "production admin token",
    "admin token",
    "production token",
    "session export",
    "control export",
  ],
  internalEvidenceFields: [
    "agent_id",
    "session_id",
    "workflow_id",
    "policy_id",
    "source_id",
  ],
} as const;

const storyBusinessIdentifiers = [
  ...demoStory.financeExceptions.flatMap((item) => [
    item.accountId,
    item.amount,
    item.amount.replace("$", ""),
    item.invoiceId,
    item.contact,
    item.theme,
  ]),
  "account identifier",
  "customer contact",
  "phone number",
  "payment amount",
  "acct_",
];

const storyRestrictedEgressPhrases = [
  ...demoStory.restrictedDestinations,
  ...demoStory.restrictedControls,
];

const storySourceContextFields = [
  ...storyBusinessIdentifiers,
  ...demoStory.internalEvidenceFields,
];

const toolEndFields = [
  "output.artifact.title",
  "output.artifact.summary",
  "output.artifact.body",
  "output.artifact.memo",
  "output.artifact.message",
  "output.artifact.nextStep",
  "output.artifact.ledgerImpact",
  "output.artifact.items.*.request",
  "output.artifact.items.*.label",
  "output.artifact.items.*.title",
  "output.artifact.items.*.summary",
  "output.artifact.items.*.body",
  "output.artifact.items.*.issue",
  "output.artifact.items.*.impact",
  "output.artifact.items.*.nextStep",
  "output.artifact.items.*.next_step",
  "output.artifact.records.*.item",
  "output.artifact.records.*.issue",
  "output.artifact.records.*.impact",
  "output.artifact.records.*.next_step",
  "output.artifact.records.*.summary",
  "output.artifact.records.*.customer_safe_detail",
  "output.artifact.records.*.internal_context",
  "output.artifact.sourceContext",
  "output.artifact.records.*.source_id",
  "output.artifact.records.*.agent_id",
  "output.artifact.records.*.session_id",
  "output.artifact.releaseCheck.*.sourceValue",
  "output.summary",
  "output.body",
];

const toolRequestFields = [
  "input.0.args.request",
  "input.args.request",
];

const toolEndStringFields = [
  "output.artifact.title",
  "output.artifact.summary",
  "output.artifact.report.*.item",
  "output.artifact.report.*.issue",
  "output.artifact.report.*.impact",
  "output.artifact.report.*.next_step",
  "output.artifact.items.*.request",
  "output.artifact.items.*.label",
  "output.artifact.items.*.title",
  "output.artifact.items.*.summary",
  "output.artifact.items.*.body",
  "output.artifact.items.*.issue",
  "output.artifact.items.*.impact",
  "output.artifact.items.*.nextStep",
  "output.artifact.items.*.next_step",
  "output.artifact.records.*.item",
  "output.artifact.records.*.issue",
  "output.artifact.records.*.impact",
  "output.artifact.records.*.next_step",
  "output.artifact.records.*.summary",
  "output.artifact.records.*.customer_safe_detail",
  "output.artifact.records.*.internal_context",
  "output.artifact.recommended_focus.*",
  "output.artifact.body",
  "output.artifact.memo",
  "output.artifact.message",
  "output.artifact.nextStep",
  "output.artifact.ledgerImpact",
  "output.artifact.sourceContext",
  "output.artifact.records.*.source_id",
  "output.artifact.records.*.agent_id",
  "output.artifact.records.*.session_id",
  "output.artifact.releaseCheck.*.sourceValue",
  "output.summary",
  "output.body",
];

function toolGuardrailSettings(fields: string[], onFail: 0 | 1) {
  return {
    on_fail: onFail,
    log_violation: true,
    activities: [
      {
        activity_type: GOVERNED_TOOL_ACTIVITY_TYPE,
        fields_to_check: fields,
      },
    ],
    timeout: 5000,
    retry_attempts: 2,
  };
}

export const demoGoalAlignmentConfig = {
  alignment_threshold: 70,
  llama_firewall_model: "gpt-4o-mini",
  drift_detection_action: "alert_only",
  evaluation_frequency: "every_action",
} as const;

export type DemoGuardrail = {
  name: string;
  description: string;
  guardrail_type: string;
  processing_stage: string;
  params: Record<string, unknown>;
  settings: Record<string, unknown>;
  trust_impact: string;
};

export type DemoBehaviorRule = {
  rule_name: string;
  description: string;
  priority: number;
  trigger: string;
  states: Array<string | { semantic_type: string; match?: Array<Record<string, unknown>> }>;
  trigger_match?: Array<Record<string, unknown>>;
  time_window: number;
  verdict: number;
  approval_timeout?: number;
  reject_message: string;
  trust_impact: string;
  trust_threshold: number;
};

type DemoPolicyBuilderDecision = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK" | "HALT";
type DemoPolicyBuilderOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "exists"
  | "not_exists";
type DemoPolicyBuilderValueType = "string" | "number" | "boolean";

type DemoPolicyBuilderCondition = {
  id: string;
  field: string;
  operator: DemoPolicyBuilderOperator;
  transform: "value" | "count";
  value: string;
  valueType: DemoPolicyBuilderValueType;
};

export type DemoPolicyBuilderRule = {
  id: string;
  name: string;
  decision: DemoPolicyBuilderDecision;
  reason: string;
  matchMode: "all" | "any";
  conditions: DemoPolicyBuilderCondition[];
};

export type DemoPolicyBuilderConfig = {
  version: 1;
  rules: DemoPolicyBuilderRule[];
};

export const demoGuardrails: DemoGuardrail[] = [
  {
    name: `${DEMO_PREFIX}pii-input-redaction`,
    description: "Redact PII from CopilotKit governed tool input before business execution.",
    guardrail_type: "1",
    processing_stage: "0",
    // Exclude DATE_TIME so ordinary scheduling text is not redacted.
    params: {
      entities: [
        "EMAIL_ADDRESS",
        "PHONE_NUMBER",
        "IP_ADDRESS",
        "US_PASSPORT",
        "US_DRIVER_LICENSE",
      ],
      replace_values: [],
    },
    settings: toolGuardrailSettings(toolRequestFields, 0),
    trust_impact: "low",
  },
  {
    name: `${DEMO_PREFIX}business-identifier-input-redaction`,
    description: "Redact demo business account and payment identifiers from CopilotKit governed tool input.",
    guardrail_type: "4",
    processing_stage: "0",
    params: {
      banned_words: storyBusinessIdentifiers,
      max_l_dist: 1,
    },
    settings: toolGuardrailSettings(toolRequestFields, 0),
    trust_impact: "low",
  },
  {
    name: `${DEMO_PREFIX}pii-output-redaction`,
    description: "Redact PII from CopilotKit governed tool output before UI rendering.",
    guardrail_type: "1",
    processing_stage: "1",
    params: {
      entities: [
        "EMAIL_ADDRESS",
        "PHONE_NUMBER",
        "IP_ADDRESS",
        "US_PASSPORT",
        "US_DRIVER_LICENSE",
      ],
      replace_values: [],
    },
    settings: toolGuardrailSettings(toolEndFields, 0),
    trust_impact: "low",
  },
  {
    name: `${DEMO_PREFIX}restricted-egress-input-control`,
    description: "Block story-specific export requests that move internal evidence to unapproved destinations.",
    guardrail_type: "4",
    processing_stage: "0",
    params: {
      banned_words: storyRestrictedEgressPhrases,
      max_l_dist: 1,
    },
    settings: toolGuardrailSettings(toolRequestFields, 1),
    trust_impact: "medium",
  },
  {
    name: `${DEMO_PREFIX}source-context-output-redaction`,
    description: "Redact finance-exception source context from UI output while preserving the customer-safe story.",
    guardrail_type: "4",
    processing_stage: "1",
    params: {
      banned_words: storySourceContextFields,
      max_l_dist: 1,
    },
    settings: toolGuardrailSettings(toolEndStringFields, 0),
    trust_impact: "low",
  },
  {
    name: `${DEMO_PREFIX}toxicity-input-monitor`,
    description: "Monitor hostile or toxic input on governed tool requests.",
    guardrail_type: "3",
    processing_stage: "0",
    params: {
      threshold: 0.98,
      validation_method: "sentence",
    },
    settings: toolGuardrailSettings(toolRequestFields, 1),
    trust_impact: "low",
  },
  {
    name: `${DEMO_PREFIX}nsfw-input-monitor`,
    description: "Monitor NSFW input on governed tool requests.",
    guardrail_type: "2",
    processing_stage: "0",
    params: {
      threshold: 0.7,
      validation_method: "sentence",
    },
    settings: toolGuardrailSettings(toolRequestFields, 0),
    trust_impact: "low",
  },
];

export const obsoleteDemoGuardrailNames = [
  "Local CopilotKit governance report PII redaction",
  `${DEMO_PREFIX}sensitive-crm-export-block`,
  `${DEMO_PREFIX}restricted-manual-submission-block`,
  `${DEMO_PREFIX}regex-input-restricted-export-block`,
  `${DEMO_PREFIX}regex-output-sensitive-source-redaction`,
  `${DEMO_PREFIX}banlist-input-data-egress-block`,
  `${DEMO_PREFIX}banlist-output-source-context-redaction`,
];

export const obsoleteDemoBehaviorRuleNames = [
  `${DEMO_PREFIX}llm-tool-call-governance-observed`,
  `${DEMO_PREFIX}llm-completion-final-output-governance`,
  `${DEMO_PREFIX}http-post-egress-approval`,
  `${DEMO_PREFIX}database-write-block`,
  `${DEMO_PREFIX}file-export-halt`,
  `${DEMO_PREFIX}internal-runtime-observed`,
  `${DEMO_PREFIX}final-output-requires-tool-result`,
];

export const demoBehaviorRules: DemoBehaviorRule[] = [
  {
    rule_name: DEMO_BEHAVIOR_RULE_NAME,
    description:
      "Require evidence lookup before outbound API submission so a CopilotKit agent cannot post externally without first reading governed source data.",
    priority: 90,
    trigger: "http_post",
    states: ["database_select"],
    time_window: 300,
    verdict: 2,
    approval_timeout: 300,
    reject_message:
      "External API POST paused: the agent must read governed database evidence before sending data outside the system.",
    trust_impact: "medium",
    trust_threshold: 30,
  },
  {
    rule_name: `${DEMO_PREFIX}file-export-requires-file-read`,
    description:
      "Require source-file review before writing or exporting a file so generated files cannot be created from unsupported memory.",
    priority: 80,
    trigger: "file_write",
    states: ["file_read"],
    time_window: 300,
    verdict: 4,
    reject_message:
      "File export halted: the agent must read source evidence before producing an exported artifact.",
    trust_impact: "high",
    trust_threshold: 50,
  },
];

export const demoBehaviorStates = demoBehaviorRules.map((rule) => rule.trigger);

function policyRule(
  id: string,
  name: string,
  decision: DemoPolicyBuilderDecision,
  reason: string,
  conditions: Array<Omit<DemoPolicyBuilderCondition, "id">>,
): DemoPolicyBuilderRule {
  return {
    id,
    name,
    decision,
    reason,
    matchMode: "all",
    conditions: conditions.map((condition, index) => ({
      id: `${id}-condition-${index + 1}`,
      ...condition,
    })),
  };
}

function startedActivityCondition(): Omit<DemoPolicyBuilderCondition, "id"> {
  return {
    field: "event_type",
    operator: "equals",
    transform: "value",
    value: "ActivityStarted",
    valueType: "string",
  };
}

function governedActionCondition(action: string): Omit<DemoPolicyBuilderCondition, "id"> {
  return {
    field: "activity_input[_].args.action",
    operator: "equals",
    transform: "value",
    value: action,
    valueType: "string",
  };
}

function governedFieldCondition(
  field: string,
  value: string,
  operator: DemoPolicyBuilderOperator = "equals",
): Omit<DemoPolicyBuilderCondition, "id"> {
  return {
    field: `activity_input[_].args.${field}`,
    operator,
    transform: "value",
    value,
    valueType: "string",
  };
}

export const demoPolicyBuilderConfig: DemoPolicyBuilderConfig = {
  version: 1,
  rules: [
    policyRule(
      `${DEMO_PREFIX}policy-rule-block-identifier-export`,
      "Block personal export of governance identifiers",
      "BLOCK",
      "OpenBox blocked goal drift from governed work into an unrelated personal internal-identifier export.",
      [
        startedActivityCondition(),
        governedActionCondition("export_governance_identifiers"),
      ],
    ),
    policyRule(
      `${DEMO_PREFIX}policy-rule-require-credit-approval`,
      "Require approval for large credit memo",
      "REQUIRE_APPROVAL",
      "OpenBox requires explicit human approval before issuing this credit memo or refund.",
      [
        startedActivityCondition(),
        governedActionCondition("issue_large_refund"),
      ],
    ),
    policyRule(
      `${DEMO_PREFIX}policy-rule-halt-payment-control-change`,
      "Halt production payment control changes",
      "HALT",
      "OpenBox halted this payment-control change because vendor bank-account changes and payment batch release are critical production actions.",
      [
        startedActivityCondition(),
        governedActionCondition("disable_production_payments"),
      ],
    ),
    policyRule(
      `${DEMO_PREFIX}policy-rule-block-sensitive-handoff`,
      "Block sensitive external data handoff",
      "BLOCK",
      "OpenBox blocked this external handoff because it includes direct OpenBox identifiers for an external destination.",
      [
        startedActivityCondition(),
        governedActionCondition("review_data_handoff"),
        governedFieldCondition("choiceId", "sensitive"),
      ],
    ),
    ...storyRestrictedEgressPhrases.map((phrase, index) =>
      policyRule(
        `${DEMO_PREFIX}policy-rule-block-manual-egress-${index + 1}`,
        `Block restricted manual egress: ${phrase}`,
        "BLOCK",
        "OpenBox blocked this human-edited draft because it requests restricted data outside approved systems.",
        [
          startedActivityCondition(),
          governedActionCondition("submit_manual_request"),
          governedFieldCondition("manualInput", phrase, "contains"),
        ],
      ),
    ),
    policyRule(
      `${DEMO_PREFIX}policy-rule-allow-minimized-handoff`,
      "Allow minimized external evidence package",
      "ALLOW",
      "OpenBox allowed this minimized external evidence package.",
      [
        startedActivityCondition(),
        governedActionCondition("review_data_handoff"),
        governedFieldCondition("choiceId", "minimal"),
      ],
    ),
    policyRule(
      `${DEMO_PREFIX}policy-rule-allow-operations-review`,
      "Allow governed operations queue review",
      "ALLOW",
      "OpenBox allowed this governed operations queue review.",
      [
        startedActivityCondition(),
        governedActionCondition("open_operations_queue"),
      ],
    ),
  ],
};

export const demoPolicyRules = `# ${DEMO_POLICY_MARKER}

default result = {"decision": "ALLOW", "action": "allow", "reason": null}

started if {
  input.event_type == "ActivityStarted"
}

tool_args := args if {
  args := input.activity_input[0].args
}

tool_args := args if {
  args := input.activity_input.args
}

governed_action := action if {
  action := tool_args.action
}

request_text := text if {
  text := lower(sprintf("%v %v %v %v %v", [
    tool_args.request,
    tool_args.destination,
    tool_args.manualInput,
    tool_args.choiceId,
    tool_args.fields,
  ]))
}

is_operations_queue_review if {
  governed_action == "open_operations_queue"
}

result := {"decision": "ALLOW", "action": "allow", "reason": "OpenBox allowed this governed operations queue review."} if {
  started
  is_operations_queue_review
}

result := {"decision": "BLOCK", "action": "block", "reason": "OpenBox blocked goal drift from governed work into an unrelated personal internal-identifier export."} if {
  started
  governed_action == "export_governance_identifiers"
}

result := {"decision": "BLOCK", "action": "block", "reason": "OpenBox blocked internal identifier export to a personal or external destination."} if {
  started
  contains(request_text, "personal gmail")
  contains(request_text, "identifier")
}

result := {"decision": "REQUIRE_APPROVAL", "action": "require_approval", "reason": "OpenBox requires explicit human approval before issuing this credit memo or refund."} if {
  started
  governed_action == "issue_large_refund"
}

result := {"decision": "HALT", "action": "halt", "reason": "OpenBox halted this payment-control change because vendor bank-account changes and payment batch release are critical production actions."} if {
  started
  governed_action == "disable_production_payments"
}

handoff_choice := choice if {
  governed_action == "review_data_handoff"
  choice := lower(sprintf("%v", [tool_args.choiceId]))
}

result := {"decision": "BLOCK", "action": "block", "reason": "OpenBox blocked this external handoff because it includes direct OpenBox identifiers for an external destination."} if {
  started
  handoff_choice == "sensitive"
}

result := {"decision": "ALLOW", "action": "allow", "reason": "OpenBox allowed this minimized external evidence package."} if {
  started
  governed_action == "review_data_handoff"
  handoff_choice == "minimal"
}

manual_payload := text if {
  governed_action == "submit_manual_request"
  text := lower(sprintf("%v %v", [tool_args.manualInput, tool_args.destination]))
}

manual_restricted if contains(manual_payload, "personal gmail")
manual_restricted if contains(manual_payload, "admin token")
manual_restricted if contains(manual_payload, "production token")
manual_restricted if contains(manual_payload, "session export")
manual_restricted if contains(manual_payload, "control export")

result := {"decision": "BLOCK", "action": "block", "reason": "OpenBox blocked this human-edited draft because it requests restricted data outside approved systems."} if {
  started
  manual_restricted
}

result := {"decision": "ALLOW", "action": "allow", "reason": "OpenBox allowed this customer update after output guardrails review."} if {
  started
  governed_action == "draft_policy_constrained_message"
}

result := {"decision": "ALLOW", "action": "allow", "reason": "OpenBox allowed this operations exception report subject to guardrail redaction."} if {
  started
  governed_action == "view_governance_report"
}`;

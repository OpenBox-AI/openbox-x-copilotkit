import {
  ChatOpenAI,
  ChatOpenAICompletions,
  type ChatOpenAIFields,
} from "@langchain/openai";

// OpenBox instruments the global fetch (registerOpenBoxOtel, called inside the
// SDK middleware) so the real provider request/response is captured into
// llm_completion spans without any per-client wiring here.

const openAIBaseUrl = process.env.OPENAI_BASE_URL;
const openAIApiKey = process.env.OPENAI_API_KEY;

const openAIMaxTokens = Number.parseInt(
  process.env.OPENAI_MAX_TOKENS || "1024",
  10,
);
const maxTokens = Number.isFinite(openAIMaxTokens) ? openAIMaxTokens : 1024;
const strictToolCalling = process.env.OPENAI_STRICT_TOOL_CALLING === "true";

export function createConfiguredChatOpenAI(
  fields: ChatOpenAIFields = {},
) {
  const model = fields.model || process.env.OPENAI_MODEL;
  if (!model) {
    throw new Error("OPENAI_MODEL is required.");
  }
  if (!openAIBaseUrl && !fields.configuration?.baseURL) {
    throw new Error("OPENAI_BASE_URL is required.");
  }
  if (!fields.apiKey && !openAIApiKey) throw new Error("OPENAI_API_KEY is required.");
  const modelFields = {
    ...fields,
    model,
    maxTokens: fields.maxTokens ?? maxTokens,
    supportsStrictToolCalling:
      fields.supportsStrictToolCalling ?? (strictToolCalling ? true : undefined),
    apiKey: fields.apiKey || openAIApiKey,
    configuration: openAIBaseUrl
      ? { ...fields.configuration, baseURL: openAIBaseUrl }
      : fields.configuration,
  };
  if (openAIBaseUrl || fields.configuration?.baseURL) {
    return new ChatOpenAICompletions(modelFields);
  }
  return new ChatOpenAI(modelFields);
}

export async function invokeConfiguredJsonChat(input: {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}): Promise<string> {
  const baseUrl = openAIBaseUrl;
  const apiKey = openAIApiKey;
  if (!baseUrl) {
    throw new Error("OPENAI_BASE_URL is required for JSON generation.");
  }
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for JSON generation.");
  }
  const model = input.model || process.env.OPENAI_MODEL;
  if (!model) {
    throw new Error("OPENAI_MODEL is required for JSON generation.");
  }
  // Reasoning models (gpt-5*, o1/o3/o4) reject `max_tokens` and a non-default
  // `temperature`; they use `max_completion_tokens`. Match what ChatOpenAI does
  // so the raw JSON-generation call works across model families.
  const isReasoningModel = /^(gpt-5|o[134])/.test(model);
  const tokenLimit = input.maxTokens ?? maxTokens;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      ...(isReasoningModel
        ? { max_completion_tokens: tokenLimit }
        : { max_tokens: tokenLimit, temperature: input.temperature }),
      response_format: { type: "json_object" },
      messages: input.messages,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`JSON chat completion failed: ${response.status} ${body.slice(0, 500)}`);
  }
  const parsed = JSON.parse(body) as {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const firstChoice = parsed.choices?.[0];
  const content = chatCompletionContentText(firstChoice?.message?.content);
  if (!content) {
    const finishReason = firstChoice?.finish_reason
      ? ` Finish reason: ${firstChoice.finish_reason}.`
      : "";
    throw new Error(`JSON chat completion returned no message content.${finishReason}`);
  }
  return content;
}

function chatCompletionContentText(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

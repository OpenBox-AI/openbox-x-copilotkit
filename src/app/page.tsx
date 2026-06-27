"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ExampleLayout } from "@/components/example-layout";
import { useGenerativeUIExamples, useExampleSuggestions } from "@/hooks";
import { withBasePath } from "@/lib/base-path";
import {
  clearOpenBoxHaltState,
  initializeOpenBoxHaltState,
  markOpenBoxSessionHalted,
  onOpenBoxSessionHalted,
  useIsOpenBoxHalted,
} from "@/lib/openbox-halt-state";

import {
  CopilotChat,
  CopilotChatMessageView,
  CopilotChatSuggestionPill,
  type CopilotChatMessageViewProps,
  type CopilotChatSuggestionViewProps,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import {
  isOpenBoxCopilotResultMessage,
  OpenBoxGovernanceDecision,
  type OpenBoxRendererTheme,
} from "@openbox-ai/openbox-sdk/copilotkit/react";
import type { Suggestion } from "@copilotkit/core";
import {
  OpenBoxLiveTimingProvider,
  useOpenBoxLiveTimingValue,
} from "@/lib/openbox-live-timing";

type IndexedSuggestion = {
  suggestion: Suggestion;
  index: number;
};

const hasSuggestionClass = (suggestion: Suggestion, className: string) =>
  suggestion.className?.split(/\s+/).includes(className) ?? false;

const isOpenBoxWorkflowSuggestion = (suggestion: Suggestion) =>
  hasSuggestionClass(suggestion, "openbox-workflow-suggestion");

export default function HomePage() {
  const [isOpenBoxHalted, setIsOpenBoxHalted] = useState(() => {
    initializeOpenBoxHaltState();
    return false;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("reset")) {
      clearOpenBoxHaltState();
      setIsOpenBoxHalted(false);
    }

    const onHalted = () => setIsOpenBoxHalted(true);
    return onOpenBoxSessionHalted(onHalted);
  }, []);

  return <OpenBoxDemoContent isOpenBoxHalted={isOpenBoxHalted} />;
}

function OpenBoxDemoContent({
  isOpenBoxHalted,
}: {
  isOpenBoxHalted: boolean;
}) {
  useGenerativeUIExamples();
  useExampleSuggestions();

  const input = useMemo(
    () => ({
      disclaimer: () => null,
      className: "pb-6",
      textArea: {
        disabled: isOpenBoxHalted,
        placeholder: isOpenBoxHalted
          ? "OpenBox halted this session. Start a new chat or reset."
          : "Type a message...",
      },
      sendButton: {
        disabled: isOpenBoxHalted,
      },
    }),
    [isOpenBoxHalted],
  );

  return (
    <ExampleLayout
      chatContent={
        <div className="flex min-h-0 flex-1 flex-col">
          <CopilotChat
            attachments={{ enabled: true }}
            input={input}
            messageView={OpenBoxMessageView}
            suggestionView={OpenBoxSuggestionView}
          />
        </div>
      }
      chatOverlay={
        <>
          {isOpenBoxHalted ? <OpenBoxHaltedOverlay /> : null}
        </>
      }
    />
  );
}

function OpenBoxMessageView(
  { className, cursor, isRunning = false, messages = [], ...props }: CopilotChatMessageViewProps,
) {
  return (
    <OpenBoxLiveTimingProvider>
      <OpenBoxMessageViewContent
        {...props}
        className={className}
        cursor={cursor}
        isRunning={isRunning}
        messages={messages}
      />
    </OpenBoxLiveTimingProvider>
  );
}

function OpenBoxMessageViewContent(
  { className, cursor, isRunning = false, messages = [], ...props }: CopilotChatMessageViewProps,
) {
  useOpenBoxLiveTimingValue();

  return (
    <CopilotChatMessageView
      {...props}
      cursor={cursor}
      isRunning={isRunning}
      messages={messages}
    >
      {({ interruptElement, isRunning: slotIsRunning, messageElements, messages: slotMessages }) => {
        const lastMessage = slotMessages[slotMessages.length - 1];
        const showCursor =
          slotIsRunning && recordValue(lastMessage).role !== "reasoning";

        return (
          <div
            data-copilotkit
            data-testid="copilot-message-list"
            className={`copilotKitMessages cpk:flex cpk:flex-col ${className ?? ""}`}
          >
            {messageElements.map((element, index) => {
              // A runtime/prompt gate halt or error (incl. HTTP 400/500/503 from
              // Core) is returned by the SDK as an ASSISTANT message whose content
              // is the OpenBox governance-result JSON string — not a tool result —
              // so the governed-tool card renderer never sees it. Detect it here
              // and render the clean governance card instead of dumping raw JSON.
              const slotMessage = slotMessages[index];
              // The governed TOOL result is ALREADY rendered by the SDK's
              // useDefaultRenderTool (renderGovernedTool) as a full governance
              // card + action artifact. Its `tool` message content also parses
              // as an OpenBox result, so rendering a fallback card for it here
              // would emit a SECOND, identical "Governance decision" card. Only
              // the runtime/prompt-gate result arrives as an ASSISTANT message
              // (never a tool result) — restrict the fallback to that case.
              const slotRole = String(
                recordValue(slotMessage).role ??
                  recordValue(slotMessage).type ??
                  "",
              ).toLowerCase();
              if (slotRole === "tool") return element;
              const result = openBoxResultForMessage(slotMessage);
              if (!result) return element;
              return (
                <OpenBoxGovernanceDecision
                  key={openBoxCardKey(element, index)}
                  result={result}
                  status="complete"
                  theme={OPENBOX_CARD_THEME}
                  onSessionHalted={markOpenBoxSessionHalted}
                />
              );
            })}
            {interruptElement}
            {showCursor ? (
              <div className="cpk:mt-2">
                <CopilotChatMessageView.Cursor />
              </div>
            ) : null}
          </div>
        );
      }}
    </CopilotChatMessageView>
  );
}

OpenBoxMessageView.Cursor = CopilotChatMessageView.Cursor;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

const OPENBOX_RESULT_SCHEMA_VERSION = "openbox.copilotkit.result.v1";

// Themed to match the governance cards rendered in use-generative-ui-examples.tsx.
const OPENBOX_CARD_THEME: OpenBoxRendererTheme = {
  logoSrc: withBasePath("/openbox-mark.png"),
  accentColor: "#3B9AF5",
  radius: 8,
  density: "comfortable",
  mode: "auto",
};

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Collect every string that could carry the governance-result JSON: the content
// itself, common text fields, and array content parts (LangChain content blocks).
function openBoxTextCandidates(message: unknown): string[] {
  const record = recordValue(message);
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string") out.push(value);
  };
  push(record.content);
  push(record.text);
  push(record.value);
  if (Array.isArray(record.content)) {
    for (const part of record.content) {
      const partRecord = recordValue(part);
      push(part);
      push(partRecord.text);
      push(partRecord.content);
      push(partRecord.value);
    }
  }
  return out;
}

// Parse the governance-result object out of an assistant message's content.
// Returns null when the content is not an OpenBox result.
function extractOpenBoxResult(
  message: unknown,
): Record<string, unknown> | null {
  for (const candidate of openBoxTextCandidates(message)) {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const record = recordValue(parsed);
      if (record.schemaVersion === OPENBOX_RESULT_SCHEMA_VERSION) {
        return record;
      }
    } catch {
      // fall through to the defensive fallback below
    }
  }
  return null;
}

// Defensive: an assistant message that LOOKS like a governance result (its text
// names the schema) but parsed imperfectly must still never render as raw JSON.
function looksLikeOpenBoxResultText(message: unknown): boolean {
  return openBoxTextCandidates(message).some((text) =>
    text.includes(OPENBOX_RESULT_SCHEMA_VERSION),
  );
}

// Best-effort scrape of a human reason from raw text when JSON.parse failed.
function scrapeOpenBoxField(message: unknown, field: string): string | undefined {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  for (const text of openBoxTextCandidates(message)) {
    const match = text.match(pattern);
    if (match) {
      try {
        return JSON.parse(`"${match[1]}"`) as string;
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

// Returns a governance-result object for any assistant message that carries one,
// synthesizing a fail-closed "unavailable" result when the JSON is malformed.
// The guarantee: a governance-result message is NEVER shown as raw text.
function openBoxResultForMessage(
  message: unknown,
): Record<string, unknown> | null {
  const parsed = extractOpenBoxResult(message);
  if (parsed) return parsed;

  if (
    isOpenBoxCopilotResultMessage(message) ||
    looksLikeOpenBoxResultText(message)
  ) {
    const haltScrape =
      scrapeOpenBoxField(message, "status") === "halted" ||
      scrapeOpenBoxField(message, "verdict") === "halt";
    return {
      schemaVersion: OPENBOX_RESULT_SCHEMA_VERSION,
      status: haltScrape ? "halted" : "error",
      verdict: haltScrape ? "halt" : "error",
      action:
        scrapeOpenBoxField(message, "action") ?? "copilotkit_runtime_gate",
      reason:
        scrapeOpenBoxField(message, "reason") ??
        scrapeOpenBoxField(message, "message") ??
        "OpenBox could not be reached. The governed action was stopped fail-closed.",
    };
  }

  return null;
}

function openBoxCardKey(element: unknown, index: number): string {
  const key = recordValue(element).key;
  return typeof key === "string" || typeof key === "number"
    ? `openbox-result-${key}`
    : `openbox-result-${index}`;
}

const OpenBoxSuggestionView = forwardRef<
  HTMLDivElement,
  CopilotChatSuggestionViewProps
>(function OpenBoxSuggestionView(
  { suggestions, onSelectSuggestion, loadingIndexes, className },
  ref,
) {
  const isRuntimeReady = useCopilotRuntimeReady();
  // A halted session is terminal — hide the chip templates so the user can't
  // start another governed action (the message input is also disabled).
  const isHalted = useIsOpenBoxHalted();
  if (isHalted) return null;
  const loadingSet = new Set(loadingIndexes ?? []);
  const grouped = suggestions.reduce(
    (groups, suggestion, index) => {
      const item = { suggestion, index };
      if (isOpenBoxWorkflowSuggestion(suggestion)) {
        return {
          ...groups,
          workflow: [...groups.workflow, item],
        };
      }

      return {
        ...groups,
        standard: [...groups.standard, item],
      };
    },
    {
      workflow: [] as IndexedSuggestion[],
      standard: [] as IndexedSuggestion[],
    },
  );

  const selectSuggestion: CopilotChatSuggestionViewProps["onSelectSuggestion"] =
    (suggestion, index) => {
      onSelectSuggestion?.(suggestion, index);
    };

  return (
    <div
      ref={ref}
      data-copilotkit
      data-testid="copilot-suggestions"
      className={`pointer-events-none space-y-3 ${className ?? ""}`}
    >
      {grouped.workflow.length > 0 ? (
        <div className="pointer-events-auto flex max-h-48 max-w-[38rem] flex-wrap items-center gap-2 overflow-y-auto pr-1">
          {grouped.workflow.map(({ suggestion, index }) => (
            <SuggestionButton
              key={`${suggestion.title}-${index}`}
              suggestion={suggestion}
              index={index}
              isLoading={!isRuntimeReady || loadingSet.has(index) || suggestion.isLoading}
              onSelectSuggestion={isRuntimeReady ? selectSuggestion : undefined}
              className={suggestion.className}
            />
          ))}
        </div>
      ) : null}

      {grouped.standard.length > 0 ? (
        <SuggestionSection title="Suggestions">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {grouped.standard.map(({ suggestion, index }) => (
              <SuggestionButton
                key={`${suggestion.title}-${index}`}
                suggestion={suggestion}
                index={index}
                isLoading={!isRuntimeReady || loadingSet.has(index) || suggestion.isLoading}
                onSelectSuggestion={isRuntimeReady ? selectSuggestion : undefined}
              />
            ))}
          </div>
        </SuggestionSection>
      ) : null}
    </div>
  );
});

function useCopilotRuntimeReady() {
  const { copilotkit } = useCopilotKit();
  const [status, setStatus] = useState(copilotkit.runtimeConnectionStatus);

  useEffect(() => {
    setStatus(copilotkit.runtimeConnectionStatus);
    const subscription = copilotkit.subscribe({
      onRuntimeConnectionStatusChanged: ({ status: nextStatus }) => {
        setStatus(nextStatus);
      },
    });
    return () => subscription.unsubscribe();
  }, [copilotkit]);

  return status === "connected";
}

function SuggestionSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pointer-events-auto rounded-md border border-[var(--border)] bg-[var(--background)]/95 px-3 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
          {title}
        </div>
        {action}
      </div>
      {description ? (
        <p className="mb-3 max-w-[36rem] text-xs leading-5 text-[var(--muted-foreground)]">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function SuggestionButton({
  suggestion,
  index,
  isLoading,
  onSelectSuggestion,
  className,
}: {
  suggestion: Suggestion;
  index: number;
  isLoading?: boolean;
  onSelectSuggestion?: CopilotChatSuggestionViewProps["onSelectSuggestion"];
  className?: string;
}) {
  return (
    <CopilotChatSuggestionPill
      className={className ?? suggestion.className}
      isLoading={isLoading}
      type="button"
      onClick={() => {
        onSelectSuggestion?.(suggestion, index);
      }}
    >
      {suggestion.title}
    </CopilotChatSuggestionPill>
  );
}

function OpenBoxHaltedOverlay() {
  const reset = () => {
    clearOpenBoxHaltState();
    window.location.href = withBasePath(`/?reset=${Date.now()}`);
  };

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-24 z-30 flex justify-center">
      <div className="pointer-events-auto w-full max-w-md rounded-md border border-red-500/40 bg-[var(--background)]/95 px-4 py-3 text-sm text-red-700 shadow-lg shadow-black/15 backdrop-blur">
        <div className="font-medium">OpenBox halted this session.</div>
        <div className="mt-1 text-red-700">
          Start a new chat or reset before sending another governed request.
        </div>
        <button
          type="button"
          className="mt-3 rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-500/10"
          onClick={reset}
        >
          Reset demo
        </button>
      </div>
    </div>
  );
}

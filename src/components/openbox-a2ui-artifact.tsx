"use client";

import { useEffect, useMemo } from "react";
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
  useA2UIError,
} from "@copilotkit/a2ui-renderer";

const OPENBOX_A2UI_OPERATIONS_KEY = "openboxA2uiOperations";

export function OpenBoxA2uiActionResult({
  result,
}: {
  result: unknown;
}) {
  const toolResult = parseResult(result);
  const operations = toOperations(toolResult[OPENBOX_A2UI_OPERATIONS_KEY]);
  if (toolResult.status !== "executed" && toolResult.status !== "constrained") {
    return null;
  }
  if (operations.length === 0) return null;
  return (
    <div className="openbox-a2ui-result">
      <A2UIProvider>
        <OpenBoxA2uiSurface operations={operations} />
      </A2UIProvider>
    </div>
  );
}

function OpenBoxA2uiSurface({
  operations,
}: {
  operations: Array<Record<string, unknown>>;
}) {
  const { processMessages } = useA2UIActions();
  const error = useA2UIError();
  const surfaceIds = useMemo(() => surfaceIdsFromOperations(operations), [operations]);
  const signature = useMemo(() => JSON.stringify(operations), [operations]);

  useEffect(() => {
    processMessages(operations);
  }, [processMessages, signature, operations]);

  if (error) {
    return (
      <div className="openbox-a2ui-error">
        CopilotKit could not render this business result.
      </div>
    );
  }

  return (
    <>
      {surfaceIds.map((surfaceId) => (
        <A2UIRenderer
          key={surfaceId}
          surfaceId={surfaceId}
          className="openbox-a2ui-surface"
        />
      ))}
    </>
  );
}

function toOperations(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function parseResult(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function surfaceIdsFromOperations(
  operations: Array<Record<string, unknown>>,
): string[] {
  const surfaceIds = new Set<string>();
  for (const operation of operations) {
    const id =
      surfaceIdFromRecord(operation.createSurface) ??
      surfaceIdFromRecord(operation.updateComponents) ??
      surfaceIdFromRecord(operation.updateDataModel) ??
      surfaceIdFromRecord(operation.deleteSurface);
    if (id) surfaceIds.add(id);
  }
  return surfaceIds.size > 0 ? Array.from(surfaceIds) : ["default"];
}

function surfaceIdFromRecord(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>).surfaceId;
  return typeof id === "string" && id.trim() ? id : undefined;
}

import {
  type A2UIOperation,
  createSurface,
  updateComponents,
  updateDataModel,
} from "./a2ui.js";

const CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json";
const OPENBOX_A2UI_OPERATIONS_KEY = "openboxA2uiOperations";
const A2UI_SURFACE_KEY = "a2uiSurface";

type JsonRecord = Record<string, unknown>;
type A2uiSurface = {
  surfaceId: string;
  catalogId: string;
  components: JsonRecord[];
  data: JsonRecord;
};

export async function withOpenBoxA2ui(
  result: unknown,
  runtimeConfig?: unknown,
): Promise<unknown> {
  const openBoxResult = parseOpenBoxResult(result);
  if (!isRenderableStatus(openBoxResult.status)) {
    return result;
  }

  void runtimeConfig;
  const generatedSurface = surfaceFromOpenBoxResult(openBoxResult);
  if (!generatedSurface) return result;
  const surface = normalizeGeneratedSurface(generatedSurface, openBoxResult);
  return {
    ...withoutA2uiSurface(openBoxResult),
    [OPENBOX_A2UI_OPERATIONS_KEY]: operationsForSurface(surface),
  };
}

function parseOpenBoxResult(input: unknown): JsonRecord {
  if (isJsonRecord(input)) return input;
  if (typeof input === "string") {
    const parsed = JSON.parse(input);
    if (isJsonRecord(parsed)) return parsed;
  }
  throw new Error("Missing OpenBox result.");
}

function operationsForSurface(surface: {
  surfaceId: string;
  catalogId: string;
  components: JsonRecord[];
  data: JsonRecord;
}): A2UIOperation[] {
  return [
    createSurface(surface.surfaceId, surface.catalogId),
    updateComponents(surface.surfaceId, surface.components),
    updateDataModel(surface.surfaceId, surface.data),
  ];
}

function isRenderableStatus(status: unknown): boolean {
  return status === "executed" || status === "constrained";
}

function withoutA2uiSurface(value: JsonRecord): JsonRecord {
  return omitInternalDisplayFields(value) as JsonRecord;
}

function omitInternalDisplayFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitInternalDisplayFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .filter(
        ([key]) =>
          ![
            "sourceContext",
            "guardrailsResult",
            "releaseCheck",
            "redacted",
            A2UI_SURFACE_KEY,
          ].includes(key),
      )
      .map(([key, item]) => [key, omitInternalDisplayFields(item)]),
  );
}

function surfaceFromOpenBoxResult(result: JsonRecord): JsonRecord | undefined {
  const artifact = recordValue(result.artifact);
  const surface = recordValue(artifact[A2UI_SURFACE_KEY]);
  return Object.keys(surface).length > 0 ? surface : undefined;
}

function normalizeGeneratedSurface(
  generated: JsonRecord,
  result: JsonRecord,
): A2uiSurface {
  const components = normalizeGeneratedComponents(generated.components).map(
    sanitizeGeneratedComponent,
  );
  if (
    components.length === 0 ||
    !components.some((component) => component.id === "root" && component.component) ||
    !isRenderableComponentTree(components)
  ) {
    throw new Error("Model did not return a valid A2UI component tree.");
  }
  return {
    surfaceId:
      stringValue(generated.surfaceId) ||
      surfaceIdFor(generatedResultFrom(result).type ?? result.action),
    catalogId: stringValue(generated.catalogId) || CATALOG_ID,
    components,
    data: isJsonRecord(generated.data) ? generated.data : { result },
  };
}

function normalizeGeneratedComponents(value: unknown): JsonRecord[] {
  const source = Array.isArray(value)
    ? value.filter(isJsonRecord)
    : isJsonRecord(value)
      ? [value]
      : [];
  if (source.length === 0) return [];

  const components: JsonRecord[] = [];
  const usedIds = new Set<string>();
  let generatedIdIndex = 0;

  const nextId = (component: JsonRecord, defaultId: string) => {
    const raw =
      stringValue(component.id) ||
      stringValue(component.componentId) ||
      stringValue(recordValue(component.props).id) ||
      defaultId;
    const base = slugId(raw) || "component";
    let candidate = base;
    while (usedIds.has(candidate)) {
      generatedIdIndex += 1;
      candidate = `${base}-${generatedIdIndex}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const addComponent = (
    component: JsonRecord,
    defaultId: string,
  ): string | undefined => {
    const kind = canonicalComponentKind(
      stringValue(component.component) || stringValue(component.type),
    );
    if (!kind) return undefined;
    const id = nextId(component, defaultId);
    const normalized = normalizeGeneratedComponent({
      ...component,
      id,
      component: kind,
    });
    if (!normalized) return undefined;

    const props = recordValue(component.props);
    if (kind === "Row" || kind === "Column" || kind === "List") {
      const childIds = normalizeChildRefs(
        component.children ?? props.children,
        id,
        addComponent,
      );
      if (childIds.length > 0) normalized.children = childIds;
    }
    if (kind === "Card") {
      const child = component.child ?? props.child;
      if (isJsonRecord(child)) {
        normalized.child = addComponent(child, `${id}-child`);
      } else if (typeof child === "string" && child.trim()) {
        normalized.child = child;
      } else {
        const childIds = normalizeChildRefs(
          component.children ?? props.children,
          id,
          addComponent,
        );
        if (childIds.length === 1) {
          normalized.child = childIds[0];
        } else if (childIds.length > 1) {
          const childColumnId = `${id}-content`;
          components.push({
            id: childColumnId,
            component: "Column",
            children: childIds,
          });
          normalized.child = childColumnId;
        }
      }
    }
    if (kind === "Card" && typeof normalized.child !== "string") {
      return undefined;
    }

    components.push(normalized);
    return id;
  };

  for (const [index, component] of source.entries()) {
    const defaultId = index === 0 ? "root" : `component-${index + 1}`;
    addComponent(component, defaultId);
  }

  return ensureRootComponent(components);
}

function normalizeGeneratedComponent(component: JsonRecord): JsonRecord | undefined {
  const props = recordValue(component.props);
  const id = stringValue(component.id);
  const kind = canonicalComponentKind(
    stringValue(component.component) || stringValue(component.type),
  );
  if (!id || !kind) return undefined;
  const normalized: JsonRecord = {
    id,
    component: kind,
    ...Object.fromEntries(
      Object.entries(props).filter(([key]) => key !== "parent"),
    ),
    ...Object.fromEntries(
      Object.entries(component).filter(
        ([key]) => !["id", "component", "type", "props"].includes(key),
      ),
    ),
  };
  delete normalized.gap;
  if (kind === "Text" && !normalized.text) {
    normalized.text =
      stringValue(normalized.title) ||
      stringValue(normalized.label) ||
      stringValue(normalized.value) ||
      stringValue(normalized.body) ||
      stringValue(normalized.content);
  }
  if (kind === "Card") {
    const child = normalized.child;
    if (typeof child !== "string" || !child.trim()) delete normalized.child;
  }
  const parent = stringValue(component.parent) || stringValue(props.parent);
  if (parent) normalized.__parent = parent;
  return normalized;
}

function normalizeChildRefs(
  value: unknown,
  parentId: string,
  addComponent: (component: JsonRecord, defaultId: string) => string | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string" && item.trim()) return item;
      if (isJsonRecord(item)) {
        return addComponent(item, `${parentId}-child-${index + 1}`);
      }
      return undefined;
    })
    .filter((id): id is string => Boolean(id));
}

function ensureRootComponent(components: JsonRecord[]): JsonRecord[] {
  if (components.length === 0) return components;
  const root = components.find((component) => component.id === "root");
  if (root) {
    if (root.component !== "Row" && root.component !== "Column") {
      const replacementId = "root-content";
      root.id = replacementId;
      const childIds = unreferencedComponentIds(components);
      return [
        {
          id: "root",
          component: "Column",
          gap: 12,
          children: childIds.includes(replacementId)
            ? childIds
            : [replacementId, ...childIds],
        },
        ...components,
      ];
    }
    if (
      (root.component === "Row" || root.component === "Column") &&
      (!Array.isArray(root.children) || root.children.length === 0)
    ) {
      root.children = unreferencedComponentIds(components);
    }
    return components;
  }

  const first = components[0];
  const firstId = stringValue(first.id);
  if (
    firstId &&
    (first.component === "Row" || first.component === "Column") &&
    !components.some((component) =>
      referencesComponent(component, firstId),
    )
  ) {
    first.id = "root";
    return components;
  }

  return [
    {
      id: "root",
      component: "Column",
      gap: 12,
      children: firstId ? [firstId] : [],
    },
    ...components,
  ];
}

function unreferencedComponentIds(components: JsonRecord[]): string[] {
  return components
    .map((component) => stringValue(component.id))
    .filter((id) =>
      Boolean(id) &&
      id !== "root" &&
      !components.some((component) => referencesComponent(component, id)),
    );
}

function referencesComponent(component: JsonRecord, id: string): boolean {
  if (component.id === id) return false;
  return (
    component.child === id ||
    (Array.isArray(component.children) && component.children.includes(id))
  );
}

function isRenderableComponentTree(components: JsonRecord[]): boolean {
  const root = components.find((component) => component.id === "root");
  if (!root) return false;
  if (
    (root.component === "Row" || root.component === "Column") &&
    (!Array.isArray(root.children) || root.children.length === 0)
  ) {
    return false;
  }
  return components.some((component) =>
    Boolean(
      stringValue(component.text) ||
        stringValue(component.child) ||
        (Array.isArray(component.children) && component.children.length > 0),
    ),
  );
}

function surfaceIdFor(type: unknown): string {
  return `openbox-${stringValue(type) || "result"}`;
}

function generatedResultFrom(result: JsonRecord): JsonRecord {
  const explicit = recordValue(result.generatedResult);
  if (Object.keys(explicit).length > 0) return explicit;
  return recordValue(result.artifact);
}

function recordValue(value: unknown): JsonRecord {
  return isJsonRecord(value) ? value : {};
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function slugId(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function canonicalComponentKind(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases: Record<string, string> = {
    title: "Text",
    header: "Text",
    heading: "Text",
    h1: "Text",
    h2: "Text",
    h3: "Text",
    text: "Text",
    paragraph: "Text",
    body: "Text",
    summary: "Text",
    message: "Text",
    note: "Text",
    row: "Row",
    horizontal: "Row",
    column: "Column",
    col: "Column",
    stack: "Column",
    vertical: "Column",
    list: "List",
    items: "List",
    card: "Card",
    dashboardcard: "Card",
    panel: "Card",
    container: "Column",
    group: "Column",
    divider: "Divider",
    rule: "Divider",
  };
  return aliases[normalized] ?? "";
}

function sanitizeGeneratedComponent(component: JsonRecord): JsonRecord {
  const kind = stringValue(component.component);
  const base = {
    id: stringValue(component.id),
    component: kind,
  };
  const weight =
    typeof component.weight === "number" && Number.isFinite(component.weight)
      ? { weight: component.weight }
      : {};
  if (kind === "Text") {
    const text = stringValue(component.text);
    return {
      ...base,
      ...weight,
      text,
      ...enumProp(component.variant, [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "caption",
        "body",
      ], "variant"),
    };
  }
  if (kind === "Row" || kind === "Column") {
    return {
      ...base,
      ...weight,
      children: stringArray(component.children),
      ...enumProp(component.align, ["start", "center", "end", "stretch"], "align"),
      ...enumProp(
        component.justify,
        [
          "start",
          "center",
          "end",
          "spaceBetween",
          "spaceAround",
          "spaceEvenly",
          "stretch",
        ],
        "justify",
      ),
    };
  }
  if (kind === "List") {
    return {
      ...base,
      ...weight,
      children: stringArray(component.children),
      ...enumProp(component.align, ["start", "center", "end", "stretch"], "align"),
      ...enumProp(component.direction, ["vertical", "horizontal"], "direction"),
    };
  }
  if (kind === "Card") {
    return {
      ...base,
      ...weight,
      child: stringValue(component.child),
    };
  }
  if (kind === "Divider") {
    return {
      ...base,
      ...weight,
      ...enumProp(component.axis, ["horizontal", "vertical"], "axis"),
    };
  }
  return base;
}

function enumProp(
  value: unknown,
  allowed: string[],
  key: string,
): JsonRecord {
  const text = stringValue(value);
  return allowed.includes(text) ? { [key]: text } : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

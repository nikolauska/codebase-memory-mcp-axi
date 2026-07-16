import { isObject, type JsonObject } from "./shared.js";

const PREVIEW_LIMIT = 1000;

export function normalizeResponse(
  tool: string,
  value: unknown,
  fields?: string[],
): { value: unknown; truncated: boolean } {
  const state = { truncated: false };
  if (!isObject(value)) return { value: truncate(value, state), truncated: state.truncated };
  let output: JsonObject = { ...value };
  for (const [key, nested] of Object.entries(output)) {
    if (Array.isArray(nested)) {
      const selected = fields ?? collectionFields(tool, key);
      if (selected) {
        output[key] = nested.map((row) => (isObject(row) ? project(row, selected, state) : truncate(row, state)));
        addCollectionCount(output, nested.length);
        continue;
      }
    }
    output[key] = truncate(nested, state);
  }
  if (fields && !Object.values(value).some(Array.isArray)) output = project(value, fields, state);
  if (tool === "get_code_snippet" && !fields) {
    output = project(value, ["name", "qualified_name", "file_path", "start_line", "end_line", "source"], state);
  }
  return { value: output, truncated: state.truncated };
}

export function responsePaging(value: JsonObject): { more: boolean; total: number; key?: string } {
  for (const [key, nested] of Object.entries(value)) {
    if (!Array.isArray(nested)) continue;
    return {
      key,
      more: value.has_more === true,
      total: typeof value.total === "number" ? value.total : nested.length,
    };
  }
  return { more: false, total: 0 };
}

export function renderable(value: unknown): JsonObject {
  return isObject(value) ? value : { result: value };
}

function collectionFields(tool: string, key: string): string[] | undefined {
  if (tool === "list_projects" && key === "projects") return ["name", "root_path", "nodes", "edges"];
  if (tool === "search_graph" && key === "results") return ["name", "qualified_name", "label", "file_path"];
  if (tool === "search_code" && key === "results") return ["node", "qualified_name", "label", "file"];
  if (tool === "trace_path" && (key === "callers" || key === "callees")) return ["name", "qualified_name", "hop"];
  if (key === "impacted_symbols") return ["name", "qualified_name", "risk", "file_path"];
}

function project(value: JsonObject, fields: string[], state: { truncated: boolean }): JsonObject {
  return Object.fromEntries(fields.map((field) => [field, truncate(fieldValue(value, field), state)]));
}

function fieldValue(value: JsonObject, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!isObject(current)) return null;
    current = current[part];
  }
  return current ?? null;
}

function truncate(value: unknown, state: { truncated: boolean }): unknown {
  if (typeof value === "string") {
    const characters = [...value];
    if (characters.length <= PREVIEW_LIMIT) return value;
    state.truncated = true;
    return `${characters.slice(0, PREVIEW_LIMIT).join("")}... (truncated, ${characters.length} chars total)`;
  }
  if (Array.isArray(value)) return value.map((item) => truncate(item, state));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, truncate(nested, state)]));
  return value;
}

function addCollectionCount(value: JsonObject, count: number): void {
  if ("count" in value) return;
  const total = typeof value.total === "number" ? value.total : count;
  value.count = total === count ? count : `${count} of ${total} total`;
}

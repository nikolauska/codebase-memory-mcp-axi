import { isObject, type JsonObject } from "./shared.js";

const PREVIEW_LIMIT = 1000;

/** Argument edits that fetch the rest of a paged collection. */
export interface Continuation {
  label: string;
  changes: Record<string, string | number | undefined>;
}

export interface ShapedResponse {
  output: JsonObject;
  truncated: boolean;
  continuations: Continuation[];
  empty: boolean;
}

/**
 * Where each tool reports "more rows exist" and which argument continues it. Upstream
 * names these keys inconsistently per collection, so they are listed rather than guessed.
 * `key` must be present in the response for the entry to apply.
 */
interface PageSpec {
  label?: string;
  key?: string;
  more: string;
  next?: string;
  offset?: string;
  cursor?: string;
  cursorArg?: string;
}

const DEFAULT_PAGES: PageSpec[] = [
  {
    more: "has_more",
    next: "next_offset",
    offset: "offset",
    cursor: "next_cursor",
    cursorArg: "cursor",
  },
];

const PAGES: Record<string, PageSpec[]> = {
  search_graph: [
    { key: "results", more: "has_more", next: "next_offset", offset: "offset" },
    {
      label: "semantic results",
      key: "semantic",
      more: "semantic_has_more",
      next: "semantic_next_offset",
      offset: "semantic_offset",
    },
  ],
  search_code: [
    { key: "results", more: "has_more", next: "next_offset", offset: "result_offset" },
    { key: "raw_matches", more: "raw_has_more", next: "raw_next_offset", offset: "raw_offset" },
    {
      key: "directories",
      more: "directories_has_more",
      next: "directory_next_offset",
      offset: "directory_offset",
    },
  ],
  // One cursor continues callers and callees together.
  trace_path: [
    { label: "trace rows", more: "has_more", cursor: "next_cursor", cursorArg: "cursor" },
  ],
  detect_changes: [
    {
      key: "changed_files",
      more: "changed_has_more",
      next: "changed_next_offset",
      offset: "changed_offset",
      cursor: "changed_next_cursor",
      cursorArg: "changed_cursor",
    },
    {
      key: "impacted",
      more: "impacted_has_more",
      next: "impacted_next_offset",
      offset: "impact_offset",
      cursor: "impacted_next_cursor",
      cursorArg: "impact_cursor",
    },
    {
      key: "impacted_modules",
      more: "module_has_more",
      next: "module_next_offset",
      offset: "module_offset",
      cursor: "module_next_cursor",
      cursorArg: "module_cursor",
    },
  ],
  // One offset pages node labels and edge types as a single list.
  get_graph_schema: [
    { label: "schema rows", more: "has_more", next: "next_offset", offset: "offset" },
  ],
  check_index_coverage: [
    { key: "paths", more: "path_has_more", next: "path_next_offset", offset: "path_offset" },
  ],
  manage_adr: [
    {
      key: "headings",
      more: "sections_has_more",
      next: "next_section_offset",
      offset: "section_offset",
    },
  ],
  get_code_snippet: [
    {
      key: "members",
      more: "members_has_more",
      next: "next_member_offset",
      offset: "member_offset",
    },
    { key: "source", more: "source_truncated", next: "next_start_line", offset: "start_line" },
  ],
};

const COMPARE_SETS = ["nodes.added", "nodes.removed", "edges.added", "edges.removed"];
const COMPARE_MAX_LIMIT = 1000;

export function shapeResponse(
  tool: string,
  value: unknown,
  options: { fields?: string[]; full?: boolean; scope?: string } = {},
): ShapedResponse {
  const state = { truncated: false };
  if (!isObject(value)) {
    return {
      output: { result: options.full ? value : truncate(value, state) },
      truncated: state.truncated,
      continuations: [],
      empty: false,
    };
  }
  let output = expandRoot(value);
  const pages = (PAGES[tool] ?? DEFAULT_PAGES).filter((page) => !page.key || page.key in output);
  const primary =
    pages.map((page) => page.key).find((key) => key && Array.isArray(output[key])) ??
    Object.keys(output).find((key) => Array.isArray(output[key]));
  const continuations = pages.flatMap((page) => continuation(output, page, primary));
  if (tool === "compare_graphs") continuations.push(...compareContinuation(output));

  if (!options.full) {
    // Continuation tokens move into the emitted next-page commands. Semantic search also
    // mirrors its offset at the root, so every spec's tokens go, not only the active ones.
    for (const page of PAGES[tool] ?? DEFAULT_PAGES) {
      if (page.next) delete output[page.next];
      if (page.cursor) delete output[page.cursor];
    }
    output = tidy(output, tool !== "query_graph") as JsonObject;
  }
  if (options.fields) {
    const fields = options.fields;
    const rows = primary ? output[primary] : undefined;
    if (primary && Array.isArray(rows))
      output[primary] = rows.map((row) => (isObject(row) ? project(row, fields) : row));
    else output = project(output, fields);
  }
  if (!options.full) {
    // Upstream already bounds snippet source and reports how to continue it, so a
    // second, smaller cap would only force a needless re-fetch.
    const exempt = tool === "get_code_snippet" ? "source" : undefined;
    output = Object.fromEntries(
      Object.entries(output).map(([key, item]) => [
        key,
        key === exempt ? item : truncate(item, state),
      ]),
    );
  }
  // A page past one list (e.g. schema labels) can leave it empty while a sibling list has rows.
  const lists = Object.values(output).filter(Array.isArray);
  const empty =
    lists.length > 0 && lists.every((list) => list.length === 0) && continuations.length === 0;
  if (empty && primary) output[primary] = options.scope ? `0 found in ${options.scope}` : "0 found";
  return { output, truncated: state.truncated, continuations, empty };
}

const DIAGNOSTIC_KEYS: Record<string, true> = { elapsed_ms: true, dedup_ratio: true };
// Search scores only order results; upstream's own compact view shows 4 significant digits.
const SCORE_KEYS: Record<string, true> = { rank: true, score: true };

/**
 * Drops upstream bookkeeping that restates the default or another field, so the answer
 * dominates the output. `--full` keeps the complete upstream response. Rows inside lists
 * are graph data, so only their search scores are rounded; Cypher rows stay untouched
 * because their column names come from the user's query.
 */
function tidy(value: unknown, roundScores: boolean, inRow = false): unknown {
  if (Array.isArray(value)) return value.map((item) => tidy(item, roundScores, true));
  if (!isObject(value)) return value;
  const pageContinues = Object.entries(value).some(
    ([key, item]) => key.endsWith("has_more") && item === true,
  );
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (roundScores && SCORE_KEYS[key] === true && typeof item === "number") {
      output[key] = Number(item.toPrecision(4));
      continue;
    }
    if (!inRow && isNoise(key, item, value, pageContinues)) continue;
    output[key] = tidy(item, roundScores, inRow);
  }
  return output;
}

function isNoise(key: string, item: unknown, parent: JsonObject, pageContinues: boolean): boolean {
  if (DIAGNOSTIC_KEYS[key] === true) return true;
  // Totals are exact unless the relation says otherwise ("gte" stays).
  if (key.endsWith("relation") && item === "eq") return true;
  if (key === "count" && item === parent.returned) return true;
  // Offsets echo the request; zero is the default first page.
  if (key.endsWith("offset") && item === 0) return true;
  if (key === "truncated" && item === false) return true;
  // A plain page cut is already stated by has_more and the next-page command.
  if (key === "truncation_reason" && item === "page_limit") return true;
  return (
    key === "truncated" &&
    pageContinues &&
    (parent.truncation_reason ?? "page_limit") === "page_limit"
  );
}

function continuation(output: JsonObject, page: PageSpec, primary?: string): Continuation[] {
  if (output[page.more] !== true) return [];
  const label = page.label ?? page.key ?? primary ?? "rows";
  const cursor = page.cursor ? output[page.cursor] : undefined;
  if (typeof cursor === "string" && page.cursorArg) {
    return [
      {
        label,
        changes: { [page.cursorArg]: cursor, ...(page.offset && { [page.offset]: undefined }) },
      },
    ];
  }
  if (!page.offset) return [];
  let next = page.next ? output[page.next] : undefined;
  // get_file_outline reports its page window but no next offset.
  if (
    next === undefined &&
    typeof output.offset === "number" &&
    typeof output.returned === "number"
  )
    next = output.offset + output.returned;
  if (typeof next !== "number") return [];
  return [
    {
      label,
      changes: { [page.offset]: next, ...(page.cursorArg && { [page.cursorArg]: undefined }) },
    },
  ];
}

function compareContinuation(output: JsonObject): Continuation[] {
  const limited = COMPARE_SETS.some((path) => {
    const set = fieldValue(output, path);
    return (
      isObject(set) &&
      set.truncated === true &&
      Array.isArray(set.truncation_reasons) &&
      set.truncation_reasons.includes("limit")
    );
  });
  return limited ? [{ label: "differences", changes: { limit: COMPARE_MAX_LIMIT } }] : [];
}

/** Upstream tables are column lists plus row arrays; TOON renders objects as tables. */
function expandRoot(value: JsonObject): JsonObject {
  const table = tableRows(value);
  const output: JsonObject = table ? { results: table.rows } : {};
  for (const [key, nested] of Object.entries(table ? table.rest : value)) {
    // Semantic search leaves an empty lexical `groups` list without columns beside its own table.
    if (key === "groups" && Array.isArray(nested) && nested.length === 0) continue;
    output[key] = expand(nested);
  }
  return output;
}

function expand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (!isObject(value)) return value;
  const table = tableRows(value);
  if (!table)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
  if (Object.keys(table.rest).length === 0) return table.rows;
  return { ...(expand(table.rest) as JsonObject), results: table.rows };
}

function tableRows(value: JsonObject): { rows: JsonObject[]; rest: JsonObject } | undefined {
  const { cols, columns, rows, groups, qn_rule: _rule, ...rest } = value;
  const names = cols ?? columns;
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) return;
  if (Array.isArray(rows)) return { rows: rows.map((row) => zip(names, row)), rest };
  if (!Array.isArray(groups)) return;
  return {
    rest,
    rows: groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.rows)) return [];
      const { rows: groupRows, qn_prefix: prefix, ...shared } = group;
      return (groupRows as unknown[]).map((row) => {
        const { name, ...fields } = zip(names, row);
        // Grouped rows share a qualified-name prefix; rebuild the full name per upstream's qn_rule.
        if (typeof prefix !== "string" || typeof name !== "string")
          return { name, ...shared, ...fields };
        return { qn: prefix ? `${prefix}.${name}` : name, ...shared, ...fields };
      });
    }),
  };
}

function zip(names: string[], row: unknown): JsonObject {
  if (!Array.isArray(row)) return { value: row };
  return Object.fromEntries(
    names.map((name, index) => {
      const cell = row[index];
      // A list cell (e.g. search_code match lines) would force TOON out of its compact
      // table layout, so short primitive lists render as one space-separated value.
      if (Array.isArray(cell) && cell.every((item) => typeof item !== "object" || item === null))
        return [name, cell.join(" ")];
      return [name, expand(cell)];
    }),
  );
}

function project(value: JsonObject, fields: string[]): JsonObject {
  return Object.fromEntries(fields.map((field) => [field, fieldValue(value, field) ?? null]));
}

function fieldValue(value: JsonObject, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function truncate(value: unknown, state: { truncated: boolean }): unknown {
  if (typeof value === "string") {
    const characters = [...value];
    if (characters.length <= PREVIEW_LIMIT) return value;
    state.truncated = true;
    return `${characters.slice(0, PREVIEW_LIMIT).join("")}... (truncated, ${characters.length} chars total)`;
  }
  if (Array.isArray(value)) return value.map((item) => truncate(item, state));
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, truncate(nested, state)]),
    );
  return value;
}

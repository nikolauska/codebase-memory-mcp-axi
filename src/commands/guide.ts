import type { ToolName } from "./tool.js";

/**
 * What each command answers, shown in top-level help, plus notes shown in that command's
 * own help. Agents choose and use commands from this text alone, so it names the flags that
 * distinguish a command. Keyed by ToolName so a new tool cannot go undocumented.
 */
export const TOOL_GUIDE: Record<ToolName, { summary: string; notes?: string[] }> = {
  search_graph: {
    summary:
      "Find symbols by --query, --name-pattern, --label, or --semantic-query (not with --query)",
    notes: [
      "--semantic-query takes a JSON array of phrases, e.g. --semantic-query '[\"retry failed upload\"]'",
      "Results default to 20; the qn column is the --qualified-name for get_code_snippet",
    ],
  },
  search_code: {
    summary: "Find text in indexed files by --pattern; add --regex true for regular expressions",
    notes: ["Results name the enclosing symbol; pass its qn to get_code_snippet for source"],
  },
  get_file_outline: {
    summary: "List one file's declarations (--file-path <repo-relative-path>)",
  },
  get_code_snippet: {
    summary: "Show a symbol's source (--qualified-name <qn or short name>)",
    notes: ["Large containers return a member outline; the response prints how to continue"],
  },
  trace_path: {
    summary: "Show callers and callees (--function-name <name> --direction inbound|outbound|both)",
  },
  detect_changes: {
    summary: "List changed files and affected symbols (--since <ref> or --base-branch <branch>)",
  },
  get_architecture: {
    summary: "Summarize languages, packages, and entry points; more via --aspects",
  },
  get_graph_schema: {
    summary: "Count node labels and edge types; --diagnostics full lists queryable properties",
  },
  query_graph: {
    summary: "Run a Cypher --query for questions the focused commands do not cover",
    notes: [
      "Run get_graph_schema --diagnostics full for labels, edge types, and properties",
      "CALLS edges are invocations; also match CALL_REFERENCE when a callable passed as a value counts as a use",
    ],
  },
  compare_graphs: {
    summary:
      "List nodes and edges added or removed between two indexed projects (--base-project, --target-project)",
  },
  check_index_coverage: {
    summary: "Check whether --paths or --scopes are fully indexed",
    notes: [
      "Use only when completeness matters or expected code is missing; it is a best-effort signal, not proof",
    ],
  },
  list_projects: { summary: "List indexed projects and their root paths" },
  index_status: { summary: "Show a project's index status and coverage details" },
  index_repository: {
    summary: "Index or re-index a repository (--repo-path)",
    notes: [
      "A first index of a large repository can take minutes",
      "If the user cache is not writable, ask the user before retrying with elevated filesystem access",
    ],
  },
  delete_project: {
    summary: "Delete a project's index (changes state)",
    notes: ["Run only when the user asks"],
  },
  manage_adr: {
    summary: "Read the project's decision record; --mode update or set_sections writes it",
    notes: [
      "Write only when the user asks",
      'Pass section_updates as raw JSON: cbm-axi manage_adr \'{"project":"<p>","mode":"set_sections","section_updates":{"Status":"Accepted"}}\'',
    ],
  },
  ingest_traces: {
    summary: "Add runtime traces to the graph (changes state)",
    notes: ["Run only when the user asks"],
  },
};

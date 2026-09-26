import type { AxiCliCommand } from "axi-sdk-js";
import { decodeBackendResult, executeBackend } from "../backend.js";
import { operational, validation } from "../errors.js";
import { shapeResponse } from "../response.js";
import { isObject, type BackendRunner, type JsonObject } from "../shared.js";
import { shellQuote, ToolArgs } from "../tool-args.js";
import { TOOL_GUIDE } from "./guide.js";

export const TOOL_NAMES = [
  "check_index_coverage",
  "compare_graphs",
  "delete_project",
  "detect_changes",
  "get_architecture",
  "get_code_snippet",
  "get_file_outline",
  "get_graph_schema",
  "index_repository",
  "index_status",
  "ingest_traces",
  "list_projects",
  "manage_adr",
  "query_graph",
  "search_code",
  "search_graph",
  "trace_path",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
export const TOOLS = new Set<string>(TOOL_NAMES);

// These tools default to upstream's `tree` text layout; cbm-axi needs JSON to render TOON.
// The backend rejects `format` on every other tool.
const JSON_FORMAT_TOOLS: Record<string, true> = {
  check_index_coverage: true,
  detect_changes: true,
  get_architecture: true,
  get_code_snippet: true,
  get_file_outline: true,
  get_graph_schema: true,
  index_status: true,
  list_projects: true,
  manage_adr: true,
  query_graph: true,
  search_code: true,
  search_graph: true,
  trace_path: true,
};

const SEARCH_GRAPH_LIMIT = 20;

// Commands that usually follow a non-empty result. `{project}` is filled in; `<...>`
// placeholders are values the agent picks from the returned rows.
const NEXT_STEPS: Record<string, Array<[command: string, purpose: string]>> = {
  search_graph: [
    ["get_code_snippet --project {project} --qualified-name <qn>", "for source"],
    ["trace_path --project {project} --function-name <name>", "for callers and callees"],
  ],
  search_code: [["get_code_snippet --project {project} --qualified-name <qn>", "for source"]],
  get_file_outline: [["get_code_snippet --project {project} --qualified-name <qn>", "for source"]],
  index_repository: [
    ['search_graph --project {project} --query "<terms>"', "to find symbols"],
    ["get_architecture --project {project}", "for the project overview"],
  ],
};

export function createToolCommands(
  backend: BackendRunner,
): Record<string, AxiCliCommand<undefined>> {
  return Object.fromEntries(
    TOOL_NAMES.map((tool) => [tool, async (args: string[]) => toolCommand(tool, args, backend)]),
  );
}

export function createForwardToolCommand(backend: BackendRunner): AxiCliCommand<undefined> {
  return async (args) => {
    const [tool, ...toolArgs] = args;
    if (!tool) validation("tool requires a tool name", "Run `cbm-axi tool <name> [flags]`");
    return toolCommand(tool, toolArgs, backend, true);
  };
}

export async function toolCommand(
  tool: string,
  args: string[],
  backend: BackendRunner,
  allowUnknown = false,
): Promise<string | JsonObject> {
  if (!allowUnknown && !TOOLS.has(tool))
    validation(`unknown MCP tool: ${tool}`, "Run `cbm-axi --help`");
  const parsed = outputFlags(args);
  if (parsed.help) return toolHelp(tool, backend);
  let toolArgs = ToolArgs.parse(tool, parsed.toolArgs);
  if (tool === "search_graph" && !toolArgs.has("limit"))
    toolArgs = toolArgs.with({ limit: SEARCH_GRAPH_LIMIT });
  const value = await requestTool(tool, toolArgs, backend);
  if (value === undefined || value === null)
    operational("backend returned no result", `Run \`cbm-axi ${tool} --help\``);

  // index_repository derives the project name itself and reports it in the response.
  const argProject = toolArgs.get("project");
  const project =
    typeof argProject === "string"
      ? argProject
      : isObject(value) && typeof value.project === "string"
        ? value.project
        : undefined;
  const shaped = shapeResponse(tool, value, {
    fields: parsed.fields,
    full: parsed.full,
    scope: typeof project === "string" ? `project ${project}` : undefined,
  });
  const fieldsFlag = parsed.fields ? ` --fields ${parsed.fields.join(",")}` : "";
  const help: string[] = [];
  if (shaped.truncated)
    help.push(`Run \`${toolArgs.command(tool)}${fieldsFlag} --full\` for complete text`);
  for (const { label, changes } of shaped.continuations) {
    const next = toolArgs.with(changes);
    // A continuation that would repeat the current request (e.g. limit already at max) is no help.
    if (next.command(tool) === toolArgs.command(tool)) continue;
    help.push(`Run \`${next.command(tool)}${fieldsFlag}\` for more ${label}`);
  }
  if (shaped.empty) help.push(`Run \`cbm-axi ${tool} --help\` for filters`);
  else {
    for (const [command, purpose] of NEXT_STEPS[tool] ?? []) {
      const scoped = command.replace("{project}", project ? shellQuote(project) : "<project>");
      help.push(`Run \`cbm-axi ${scoped}\` ${purpose}`);
    }
  }
  if (help.length > 0) shaped.output.help = help;
  return shaped.output;
}

export async function requestTool(
  tool: string,
  args: ToolArgs,
  backend: BackendRunner,
): Promise<unknown> {
  let request = args;
  if (JSON_FORMAT_TOOLS[tool] === true) {
    if (args.has("format"))
      validation(
        "--format is managed by cbm-axi",
        `Remove --format; cbm-axi always renders TOON. Run \`cbm-axi ${tool} --help\``,
      );
    request = args.with({ format: "json" });
  }
  const result = await executeBackend(backend, ["cli", "--json", tool, ...request.backendArgs()]);
  return decodeBackendResult(result, tool);
}

async function toolHelp(tool: string, backend: BackendRunner): Promise<string> {
  const result = await executeBackend(backend, ["cli", tool, "--help"], true);
  const text = (result.stdout.trim() || result.stderr.trim()).replace(/^.*?(?=Usage:)/s, "");
  if (!text) operational("backend returned no help", `Run \`cbm-axi ${tool}\``);
  const lines = text
    .split("\n")
    // cbm-axi owns the output format and always passes flags, so the backend would ignore stdin.
    .filter((line) => !line.includes("echo '<json>' |"))
    .filter((line) => !(JSON_FORMAT_TOOLS[tool] === true && /^\s*--format\b/.test(line)))
    .map((line) => line.replace("codebase-memory-mcp cli ", "cbm-axi "));
  const guide = TOOLS.has(tool) ? TOOL_GUIDE[tool as ToolName] : undefined;
  const notes = guide?.notes ?? [];
  return [
    ...(guide ? [guide.summary, ""] : []),
    ...lines,
    "",
    "cbm-axi flags:",
    "  --fields <a,b>  Keep only these fields (dotted paths) of the main result rows",
    "  --full  Show the complete response and untruncated text",
    ...(notes.length > 0 ? ["", "Notes:", ...notes.map((note) => `  ${note}`)] : []),
    "",
  ].join("\n");
}

function outputFlags(args: string[]): {
  toolArgs: string[];
  fields?: string[];
  full: boolean;
  help: boolean;
} {
  const toolArgs: string[] = [];
  let fields: string[] | undefined;
  let full = false;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--full") full = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--fields") {
      const value = args[++index];
      if (value === undefined) validation("--fields requires a value");
      fields = splitFields(value);
    } else if (arg.startsWith("--fields=")) fields = splitFields(arg.slice(9));
    else toolArgs.push(arg);
  }
  return { toolArgs, fields, full, help };
}

function splitFields(value: string): string[] {
  return value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

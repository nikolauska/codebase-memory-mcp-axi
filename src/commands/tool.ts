import type { AxiCliCommand } from "axi-sdk-js";
import { decodeBackendResult, executeBackend } from "../backend.js";
import { operational, validation } from "../errors.js";
import { normalizeResponse, renderable, responsePaging } from "../response.js";
import type { BackendRunner, JsonObject } from "../shared.js";

export const TOOL_NAMES = [
  "delete_project",
  "detect_changes",
  "get_architecture",
  "get_code_snippet",
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
export const TOOLS = new Set<string>(TOOL_NAMES);

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
  const toolArgs = defaultToolArgs(tool, parsed.toolArgs);
  const result = await executeBackend(backend, [
    "cli",
    "--json",
    tool,
    ...serializeToolArgs(toolArgs),
  ]);
  const value = decodeBackendResult(result, tool);

  if (value === undefined || value === null)
    operational("backend returned no result", `Run \`cbm-axi ${tool} --help\``);
  if (parsed.full) return renderable(value);

  const { value: normalized, truncated } = normalizeResponse(tool, value, parsed.fields);
  const output = renderable(normalized);
  const paging = responsePaging(output);
  const help: string[] = [];
  if (truncated) help.push(`Run \`${commandWith(tool, toolArgs, "--full")}\` for complete text`);
  if (paging.more && paging.key)
    help.push(`Run \`${nextPageCommand(tool, toolArgs)}\` for remaining ${paging.key}`);
  if (paging.key && paging.total === 0) {
    output[paging.key] = "0 found";
    help.push(`Run \`cbm-axi ${tool} --help\` for filters`);
  }
  if (help.length > 0) output.help = help;
  return output;
}

async function toolHelp(tool: string, backend: BackendRunner): Promise<string> {
  const result = await executeBackend(backend, ["cli", tool, "--help"], true);
  const text = (result.stdout.trim() || result.stderr.trim()).replace(/^.*?(?=Usage:)/s, "");
  if (!text) operational("backend returned no help", `Run \`cbm-axi ${tool}\``);
  return `${text}\n`;
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

function defaultToolArgs(tool: string, args: string[]): string[] {
  if (tool !== "search_graph" && tool !== "search_code") return args;
  if (args.some((arg) => arg === "--limit" || arg.startsWith("--limit="))) return args;
  if (args.length === 1) {
    try {
      const value = JSON.parse(args[0]);
      if (value && typeof value === "object" && !Array.isArray(value) && !("limit" in value)) {
        return [JSON.stringify({ ...value, limit: 20 })];
      }
    } catch {
      // Validation below will report malformed arguments.
    }
  }
  if (args.includes("--args-file")) return args;
  return [...args, "--limit", "20"];
}

export function serializeToolArgs(args: string[]): string[] {
  if (args.length === 0 || (args.length === 1 && isJson(args[0])) || args.includes("--args-file"))
    return args;
  const values: JsonObject = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith("--")) validation(`unexpected argument: ${arg}`);
    const equals = arg.indexOf("=");
    const key = arg.slice(2, equals < 0 ? undefined : equals).replaceAll("-", "_");
    let value: unknown;
    if (equals >= 0) value = arg.slice(equals + 1);
    else if (args[index + 1] === undefined || args[index + 1].startsWith("--")) value = true;
    else value = args[++index];
    values[key] = typeof value === "string" ? toolArgValue(key, value) : value;
  }
  return [JSON.stringify(values)];
}

function toolArgValue(key: string, value: string): unknown {
  if (key === "repo_path" && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\"))) {
    value = value.replaceAll("\\", "/");
  }
  if (
    ["limit", "offset", "depth", "max_depth", "min_degree", "max_degree"].includes(key) &&
    /^-?\d+$/.test(value)
  ) {
    return Number(value);
  }
  if ((value.startsWith("[") || value.startsWith("{")) && isJson(value)) return JSON.parse(value);
  if (value === "true" || value === "false") return value === "true";
  return value;
}

function nextPageCommand(tool: string, args: string[]): string {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--offset") {
      index++;
      continue;
    }
    if (!args[index].startsWith("--offset=")) filtered.push(shellQuote(args[index]));
  }
  return ["cbm-axi", tool, ...filtered, "--offset", "<next-offset>"].join(" ");
}

function commandWith(tool: string, args: string[], extra: string): string {
  return ["cbm-axi", tool, ...args.map(shellQuote), extra].join(" ");
}

function shellQuote(value: string): string {
  return value === "" || /[\s"'<>|&;$`()]/.test(value) ? JSON.stringify(value) : value;
}

function splitFields(value: string): string[] {
  return value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

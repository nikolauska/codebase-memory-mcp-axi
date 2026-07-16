import { cwd } from "node:process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { decodeBackendResult, executeBackend } from "../backend.js";
import { normalizeResponse, renderable } from "../response.js";
import { isObject, type BackendRunner, type JsonObject } from "../shared.js";
import { serializeToolArgs } from "./tool.js";

const INSTRUCTIONS = [
  "Use the `cbm-axi` skill when exploring this codebase.",
  "Search the graph before reading source files broadly.",
  "Fetch exact snippets and trace relationships only after locating relevant symbols.",
];

export async function dashboard(backend: BackendRunner): Promise<JsonObject> {
  const projects = await callTool("list_projects", [], backend);
  const project = currentProject(projects, cwd());
  if (!project) {
    return {
      instructions: INSTRUCTIONS,
      projects: `0 indexed for ${cwd()}`,
      help: [
        `Run \`cbm-axi index_repository --repo-path ${shellQuote(cwd())}\` to index this directory`,
        "Run `cbm-axi list_projects` to inspect indexed projects",
      ],
    };
  }
  const status = renderable(await callTool("index_status", ["--project", project], backend));
  return {
    instructions: INSTRUCTIONS,
    project,
    ...normalizeResponse("index_status", status).value as JsonObject,
    help: [
      `Run \`cbm-axi search_graph --project ${shellQuote(project)} --query "<terms>"\` to find symbols`,
      `Run \`cbm-axi get_architecture --project ${shellQuote(project)}\` for the project overview`,
    ],
  };
}

async function callTool(tool: string, args: string[], backend: BackendRunner): Promise<unknown> {
  const result = await executeBackend(backend, ["cli", "--json", tool, ...serializeToolArgs(args)]);
  return decodeBackendResult(result, tool);
}

export function currentProject(value: unknown, directory: string): string {
  if (!isObject(value) || !Array.isArray(value.projects)) return "";
  const current = resolve(directory);
  let best = "";
  let bestLength = -1;
  for (const item of value.projects) {
    if (!isObject(item) || typeof item.root_path !== "string" || typeof item.name !== "string") continue;
    const root = resolve(item.root_path);
    const path = relative(root, current);
    if (path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))) {
      if (root.length > bestLength) {
        best = item.name;
        bestLength = root.length;
      }
    }
  }
  return best;
}

function shellQuote(value: string): string {
  return value === "" || /[\s"'<>|&;$`()]/.test(value) ? JSON.stringify(value) : value;
}

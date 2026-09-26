import { cwd } from "node:process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isObject, type BackendRunner, type JsonObject } from "../shared.js";
import { shellQuote, ToolArgs } from "../tool-args.js";
import { requestTool } from "./tool.js";

const INSTRUCTIONS = [
  "Run `cbm-axi --help` to choose a command and `cbm-axi <command> --help` for its flags.",
  "Search the graph before reading source files broadly.",
  "Fetch exact snippets and trace relationships only after locating relevant symbols.",
];

const LIST_PROJECTS_MAX_LIMIT = 500;
const SUMMARY_KEYS = ["status", "nodes", "edges", "indexed_at"];

export interface ProjectRoot {
  name: string;
  root: string;
}

interface ProjectState extends ProjectRoot {
  status: JsonObject;
  legacy: boolean;
}

export async function dashboard(backend: BackendRunner): Promise<JsonObject> {
  const candidates = currentProjects(await listAllProjects(backend), cwd());
  if (candidates.length === 0) {
    return {
      instructions: INSTRUCTIONS,
      projects: `0 indexed for ${cwd()}`,
      help: [
        `Run \`cbm-axi index_repository --repo-path ${shellQuote(cwd())}\` to index this directory`,
        "Run `cbm-axi list_projects` to inspect indexed projects",
      ],
    };
  }
  const states = await Promise.all(candidates.map((candidate) => projectState(candidate, backend)));
  // Several projects can share a root (e.g. one indexed again under --name); the most
  // recently indexed one is the likeliest to be current. ISO timestamps sort as strings.
  states.sort((a, b) =>
    String(b.status.indexed_at ?? "").localeCompare(String(a.status.indexed_at ?? "")),
  );
  const [current, ...others] = states;
  const project = shellQuote(current.name);
  const help: string[] = [];
  if (current.legacy) {
    help.push(
      `Run \`cbm-axi index_repository --repo-path ${shellQuote(current.root)} --name ${project}\` to rebuild the index`,
    );
  }
  help.push(
    `Run \`cbm-axi search_graph --project ${project} --query "<terms>"\` to find symbols`,
    `Run \`cbm-axi get_architecture --project ${project}\` for the project overview`,
    `Run \`cbm-axi index_status --project ${project}\` for coverage details`,
  );
  return {
    instructions: INSTRUCTIONS,
    project: current.name,
    // The home view only needs freshness and size; coverage detail stays behind `index_status`.
    ...Object.fromEntries(
      SUMMARY_KEYS.filter((key) => key in current.status).map((key) => [key, current.status[key]]),
    ),
    ...(current.legacy && {
      index: "built before generation tracking; paging cursors and coverage checks need a rebuild",
    }),
    ...(others.length > 0 && { also_indexed_here: others.map((other) => other.name) }),
    help,
  };
}

async function projectState(candidate: ProjectRoot, backend: BackendRunner): Promise<ProjectState> {
  const args = ["--project", candidate.name];
  const [status, coverage] = await Promise.all([
    requestTool("index_status", ToolArgs.parse("index_status", args), backend),
    // Coverage metadata is the only backend signal of an index built before generation
    // tracking. It is advisory, so a failed probe must not break the home view.
    requestTool(
      "check_index_coverage",
      ToolArgs.parse("check_index_coverage", [...args, "--scopes", "."]),
      backend,
    ).catch(() => undefined),
  ]);
  const generation =
    isObject(coverage) && isObject(coverage.metadata) ? coverage.metadata.generation : undefined;
  return {
    ...candidate,
    status: isObject(status) ? status : {},
    // Upstream refuses snapshot cursors for these same generation values.
    legacy: generation === "" || generation === "legacy",
  };
}

// The current directory's project may sit beyond the first page of a long project list.
async function listAllProjects(backend: BackendRunner): Promise<unknown[]> {
  const projects: unknown[] = [];
  let offset = 0;
  for (;;) {
    const args = ["--limit", String(LIST_PROJECTS_MAX_LIMIT), "--offset", String(offset)];
    const page = await requestTool("list_projects", ToolArgs.parse("list_projects", args), backend);
    if (!isObject(page) || !Array.isArray(page.projects)) return projects;
    projects.push(...page.projects);
    if (page.has_more !== true || typeof page.next_offset !== "number") return projects;
    offset = page.next_offset;
  }
}

/** Projects whose root is the closest ancestor of `directory`; several may share it. */
export function currentProjects(projects: unknown[], directory: string): ProjectRoot[] {
  const current = resolve(directory);
  let best: ProjectRoot[] = [];
  for (const item of projects) {
    if (!isObject(item) || typeof item.root_path !== "string" || typeof item.name !== "string")
      continue;
    const root = resolve(item.root_path);
    const path = relative(root, current);
    if (path !== "" && (path.startsWith(`..${sep}`) || path === ".." || isAbsolute(path))) continue;
    const bestLength = best[0]?.root.length ?? -1;
    if (root.length > bestLength) best = [{ name: item.name, root }];
    else if (root.length === bestLength) best.push({ name: item.name, root });
  }
  return best;
}

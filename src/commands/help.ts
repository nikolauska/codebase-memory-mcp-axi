import type { AxiCliCommand } from "axi-sdk-js";
import { validation } from "../errors.js";
import type { BackendRunner } from "../shared.js";
import { TOOL_GUIDE } from "./guide.js";
import { TOOLS, toolCommand } from "./tool.js";

const COMMANDS: Record<string, string> = {
  "(none)": "Show the current directory's project status and next commands",
  ...Object.fromEntries(Object.entries(TOOL_GUIDE).map(([tool, { summary }]) => [tool, summary])),
  "tool <name>": "Run a backend tool that has no named command yet",
  "setup hooks": "Install session hooks for Claude Code, Codex, and OpenCode (edits user config)",
  "help <command>": "Show a command's flags and notes",
};

// General rules for every command; command-specific notes live in each command's --help.
const NOTES = [
  "Graph commands need --project <project>; run `cbm-axi` or `cbm-axi list_projects` to find it",
  "Search the graph before reading files broadly; read source through get_code_snippet once a symbol is found",
  "Follow the help lines in each response: next-page commands carry offsets and cursors; replace <placeholders> with values from the rows",
  "has_more: true means a partial list; a relation of gte means the total is a lower bound",
  "`0 found in project <name>` is a real empty result",
  "Pass object arguments as one raw JSON object argument instead of flags",
  "Commands that change state (delete_project, ingest_traces, manage_adr writes, setup hooks, update) run only when the user asks",
  "Exit codes: 0 success, 1 operational failure, 2 invalid usage",
  "Run `cbm-axi <command> --help` for a command's flags and notes",
];

const EXAMPLES = [
  "cbm-axi",
  'cbm-axi search_graph --project <project> --query "<terms>"',
  "cbm-axi get_code_snippet --project <project> --qualified-name <qn>",
  "cbm-axi trace_path --project <project> --function-name <name> --direction inbound",
];

export const TOP_LEVEL_HELP = [
  "usage: cbm-axi [command] [flags]",
  `commands[${Object.keys(COMMANDS).length}]:`,
  ...Object.entries(COMMANDS).map(([command, summary]) => `  ${command}: ${summary}`),
  `notes[${NOTES.length}]:`,
  ...NOTES.map((note) => `  ${note}`),
  `examples[${EXAMPLES.length}]:`,
  ...EXAMPLES.map((example) => `  ${example}`),
  "",
].join("\n");

export function createHelpCommand(backend: BackendRunner): AxiCliCommand<undefined> {
  return async (args) => {
    const [command] = args;
    if (!command) return TOP_LEVEL_HELP;
    if (TOOLS.has(command)) return toolCommand(command, ["--help"], backend);
    const help = commandHelp(command);
    if (help) return help;
    validation(`unknown command: ${command}`, "Run `cbm-axi --help`");
  };
}

export function commandHelp(command: string): string | undefined {
  if (command === "setup") return "usage: cbm-axi setup hooks\n";
}

import type { AxiCliCommand } from "axi-sdk-js";
import { validation } from "../errors.js";
import type { BackendRunner } from "../shared.js";
import { TOOLS, TOOL_NAMES, toolCommand } from "./tool.js";

export const TOP_LEVEL_HELP = `usage: cbm-axi [command] [flags]
commands[18]:
  (none)=dashboard
  setup hooks
  tool <name>
  help
  ${TOOL_NAMES.join("\n  ")}
examples[3]:
  cbm-axi
  cbm-axi search_graph --project <project> --query "<terms>"
  cbm-axi get_code_snippet --project <project> --qualified-name <qualified-name> --full
`;

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

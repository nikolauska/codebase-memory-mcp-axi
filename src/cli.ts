import { readFile } from "node:fs/promises";
import {
  installSessionStartHooks,
  runAxiCli,
  type AxiCliCommand,
  type InstallSessionStartHooksOptions,
} from "axi-sdk-js";
import { runBackend } from "./backend.js";
import { dashboard } from "./commands/dashboard.js";
import { commandHelp, createHelpCommand, TOP_LEVEL_HELP } from "./commands/help.js";
import { createSetupCommand } from "./commands/setup.js";
import { createForwardToolCommand, createToolCommands } from "./commands/tool.js";
import type { BackendRunner } from "./shared.js";

interface RunDependencies {
  backend?: BackendRunner;
  installHooks?: (options?: InstallSessionStartHooksOptions) => void;
  stdout?: { write(chunk: string): unknown };
  version?: string;
}

export async function main(): Promise<void> {
  await run(process.argv.slice(2));
}

export async function run(
  argv: string[],
  dependencies: RunDependencies = {},
): Promise<void> {
  const backend = dependencies.backend ?? runBackend;
  const installHooks = dependencies.installHooks ?? installSessionStartHooks;
  const commands: Record<string, AxiCliCommand<undefined>> = {
    ...createToolCommands(backend),
    tool: createForwardToolCommand(backend),
    help: createHelpCommand(backend),
    setup: createSetupCommand(installHooks),
  };

  await runAxiCli({
    argv,
    commands,
    description: "Agent interface for codebase-memory graph queries.",
    getCommandHelp: commandHelp,
    home: async () => dashboard(backend),
    packageName: "@nikolauska/cbm-axi",
    stdout: dependencies.stdout,
    topLevelHelp: TOP_LEVEL_HELP,
    version: dependencies.version ?? (await packageVersion()),
  });
}

async function packageVersion(): Promise<string> {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return String((JSON.parse(raw) as Record<string, unknown>).version ?? "dev");
}

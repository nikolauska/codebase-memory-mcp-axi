import { readFileSync } from "node:fs";
import { validation } from "./errors.js";
import { isObject, type JsonObject } from "./shared.js";

type ArgValue = string | number;

/**
 * Upstream tool arguments in whichever form the caller used: CLI flags, one raw JSON
 * object, or `--args-file`. The backend ignores extra flags once raw JSON or an args
 * file is present, so cbm-axi must edit arguments in the caller's own form.
 */
export class ToolArgs {
  private constructor(
    private readonly flags: string[],
    private readonly json: JsonObject | undefined,
    private readonly file: string | undefined,
  ) {}

  static parse(tool: string, args: string[]): ToolArgs {
    if (args.length === 1 && args[0].trimStart().startsWith("{")) {
      return new ToolArgs([], parseObject(args[0], tool), undefined);
    }
    const fileIndex = args.indexOf("--args-file");
    if (fileIndex < 0) return new ToolArgs(args, undefined, undefined);
    const file = args[fileIndex + 1];
    if (file === undefined || args.length !== 2) {
      validation(
        "--args-file takes one path and no other tool flags",
        `Run \`cbm-axi ${tool} --help\``,
      );
    }
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      validation(
        `cannot read --args-file ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return new ToolArgs([], parseObject(text, tool), file);
  }

  has(key: string): boolean {
    if (this.json) return key in this.json;
    const flag = flagName(key);
    return this.flags.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  }

  get(key: string): unknown {
    if (this.json) return this.json[key];
    const flag = flagName(key);
    for (let index = 0; index < this.flags.length; index++) {
      const arg = this.flags[index];
      if (arg === flag) return this.flags[index + 1];
      if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
  }

  with(changes: Record<string, ArgValue | undefined>): ToolArgs {
    if (this.json) {
      const json = { ...this.json };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) delete json[key];
        else json[key] = value;
      }
      // An edited args file is sent inline; the caller's file stays untouched.
      return new ToolArgs([], json, undefined);
    }
    let flags = this.flags;
    for (const [key, value] of Object.entries(changes)) {
      flags = withoutFlag(flags, flagName(key));
      if (value !== undefined) flags = [...flags, flagName(key), String(value)];
    }
    return new ToolArgs(flags, undefined, undefined);
  }

  backendArgs(): string[] {
    if (this.file !== undefined) return ["--args-file", this.file];
    if (this.json) {
      const json =
        typeof this.json.repo_path === "string"
          ? { ...this.json, repo_path: normalizeWindowsPath(this.json.repo_path) }
          : this.json;
      return [JSON.stringify(json)];
    }
    return serializeToolArgs(this.flags);
  }

  command(tool: string): string {
    const args =
      this.file !== undefined
        ? ["--args-file", this.file]
        : this.json
          ? [JSON.stringify(this.json)]
          : this.flags;
    return ["cbm-axi", tool, ...args.map(shellQuote)].join(" ");
  }
}

export function serializeToolArgs(args: string[]): string[] {
  return args.map((arg, index) => {
    if (index > 0 && args[index - 1] === "--repo-path") return normalizeWindowsPath(arg);
    if (arg.startsWith("--repo-path=")) return `--repo-path=${normalizeWindowsPath(arg.slice(12))}`;
    return arg;
  });
}

export function shellQuote(value: string): string {
  if (value !== "" && !/[\s"'<>|&;$`(){}\\*?]/.test(value)) return value;
  // Single quotes keep JSON arguments and Cypher readable and stop `$` expansion in POSIX shells.
  return value.includes("'") ? JSON.stringify(value) : `'${value}'`;
}

function parseObject(text: string, tool: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Fall through to the shared object-shape error.
  }
  if (!isObject(value))
    validation("tool arguments must be a JSON object", `Run \`cbm-axi ${tool} --help\``);
  return value;
}

function flagName(key: string): string {
  return `--${key.replaceAll("_", "-")}`;
}

function withoutFlag(args: string[], flag: string): string[] {
  const kept: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flag) index++;
    else if (!args[index].startsWith(`${flag}=`)) kept.push(args[index]);
  }
  return kept;
}

function normalizeWindowsPath(value: string): string {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")
    ? value.replaceAll("\\", "/")
    : value;
}

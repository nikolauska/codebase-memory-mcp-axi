import { spawn } from "node:child_process";
import { operational, validation } from "./errors.js";
import { isObject, type BackendResult, type BackendRunner, type JsonObject } from "./shared.js";

const BACKEND = "codebase-memory-mcp";

const REQUIRED_BACKEND_VERSION = [0, 11, 0] as const;

export function requireBackendVersion(backend: BackendRunner): BackendRunner {
  let verification: Promise<void> | undefined;
  return async (args, signal) => {
    verification ??= verifyBackendVersion(backend, signal);
    await verification;
    return backend(args, signal);
  };
}

async function verifyBackendVersion(backend: BackendRunner, signal?: AbortSignal): Promise<void> {
  const result = await executeBackend(backend, ["--version"], false, signal);
  const match = /(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?![-+])(?:\s|$)/.exec(result.stdout);
  const version = match?.slice(1).map(Number);
  if (
    !version ||
    version[0] < REQUIRED_BACKEND_VERSION[0] ||
    (version[0] === REQUIRED_BACKEND_VERSION[0] &&
      (version[1] < REQUIRED_BACKEND_VERSION[1] ||
        (version[1] === REQUIRED_BACKEND_VERSION[1] && version[2] < REQUIRED_BACKEND_VERSION[2])))
  ) {
    operational(
      "codebase-memory-mcp 0.11.0 or newer is required",
      "Upgrade `codebase-memory-mcp` to version 0.11.0 or newer",
    );
  }
}

export const runBackend: BackendRunner = (args, signal) => {
  const { promise, resolve, reject } = Promise.withResolvers<BackendResult>();
  const child = spawn(BACKEND, args, {
    // Upstream owns runtime setup; only silence logs for structured CLI output.
    env: { ...process.env, CBM_LOG_LEVEL: "none" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let aborted = false;
  const abort = () => {
    aborted = true;
    child.kill();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  child.once("error", (error) => reject(new Error(`${BACKEND} failed to start: ${error.message}`)));
  child.once("close", (status) => {
    signal?.removeEventListener("abort", abort);
    if (aborted) {
      reject(
        signal?.reason instanceof Error ? signal.reason : new Error("Backend request cancelled"),
      );
      return;
    }
    resolve({ stdout, stderr, status: status ?? 1 });
  });
  return promise;
};

export async function executeBackend(
  backend: BackendRunner,
  args: string[],
  allowFailure = false,
  signal?: AbortSignal,
): Promise<BackendResult> {
  let result: BackendResult;
  try {
    result = await backend(args, signal);
  } catch (error) {
    operational(error instanceof Error ? error.message : String(error));
  }
  if (!allowFailure && result.status !== 0 && result.stderr.trim()) {
    const stderr = result.stderr.trim();
    const unknownFlag = /unknown flag (\S+)/.exec(stderr);
    if (unknownFlag) {
      const tool =
        args[0] === "cli"
          ? args.find((arg, index) => index > 0 && !arg.startsWith("-"))
          : undefined;
      validation(
        `unknown flag ${unknownFlag[1]}`,
        `Run \`cbm-axi ${tool ? `${tool} ` : ""}--help\``,
      );
    }
    operational(stderr);
  }
  if (!allowFailure && result.status !== 0 && !result.stdout.trim())
    operational(`backend exited with status ${result.status}`);
  return result;
}

export function decodeBackendResult(result: BackendResult, tool: string): unknown {
  let root: unknown;
  try {
    root = JSON.parse(result.stdout);
  } catch {
    operational("backend returned invalid JSON", `Run \`cbm-axi ${tool} --help\``);
  }
  if (!isObject(root)) {
    if (result.status !== 0) operational(`backend exited with status ${result.status}`);
    return root;
  }
  if (root.isError === true) return decodeBackendError(root, tool);
  if (result.status !== 0) operational(`backend exited with status ${result.status}`);
  if ("structuredContent" in root) return root.structuredContent;
  const text = contentText(root);
  if (!text) return root;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function decodeBackendError(root: JsonObject, tool: string): unknown {
  const text = contentText(root);
  let error: unknown = root.structuredContent;
  if (!isObject(error)) {
    try {
      error = JSON.parse(text);
    } catch {
      // The backend may return plain text instead of a structured error.
    }
  }
  if (isObject(error)) {
    // Deleting an absent project already satisfies the request.
    if (tool === "delete_project" && error.status === "not_found") {
      return { project: "already absent (no-op)" };
    }
    if (typeof error.error === "string") {
      const help = `Run \`cbm-axi ${tool} --help\``;
      // Upstream usage hints describe MCP JSON arguments; the cbm-axi help shows its flags.
      if (isUsageError(error.error, error.code)) validation(error.error, help);
      operational(error.error, typeof error.hint === "string" ? error.hint : help);
    }
  }
  operational(firstUsefulLine(text) || "backend request failed");
}

// Upstream has no uniform usage-error code, so known argument failures are matched by text
// to give them the usage exit code instead of the operational one.
function isUsageError(message: string, code: unknown): boolean {
  return (
    code === "invalid_arguments" ||
    /^(missing required argument|unknown tool|invalid_cursor)|mutually exclusive/.test(message)
  );
}

function contentText(value: JsonObject): string {
  const content = value.content;
  if (!Array.isArray(content) || !isObject(content[0])) return "";
  return typeof content[0].text === "string" ? content[0].text : "";
}

function firstUsefulLine(value: string): string {
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("level=") && !line.startsWith("warning:")) ?? ""
  );
}

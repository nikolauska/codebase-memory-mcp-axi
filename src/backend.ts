import { spawn } from "node:child_process";
import { join } from "node:path";
import { operational } from "./errors.js";
import { isObject, type BackendResult, type BackendRunner, type JsonObject } from "./shared.js";

const BACKEND = "codebase-memory-mcp";

const REQUIRED_BACKEND_VERSION = [0, 10, 2] as const;

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
      "codebase-memory-mcp 0.10.2 or newer is required",
      "Upgrade `codebase-memory-mcp` to version 0.10.2 or newer",
    );
  }
}

export const runBackend: BackendRunner = (args, signal) => {
  const { promise, resolve, reject } = Promise.withResolvers<BackendResult>();
  const child = spawn(BACKEND, args, {
    env: backendEnvironment(process.env),
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

export function backendEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    CBM_LOG_LEVEL: "none",
    // The backend validates the runtime directory's parent, so keep it below the private user dir.
    CBM_RUNTIME_DIR:
      environment.CBM_RUNTIME_DIR ??
      (environment.XDG_RUNTIME_DIR ? join(environment.XDG_RUNTIME_DIR, "cbm-axi") : undefined),
  };
}

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
  if (!allowFailure && result.status !== 0 && result.stderr.trim())
    operational(result.stderr.trim());
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
  if (text) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The backend may return plain text instead of a structured error.
    }
    if (isObject(parsed) && typeof parsed.error === "string") {
      if (tool === "delete_project" && parsed.error.toLowerCase().includes("not found")) {
        return { project: "already absent (no-op)" };
      }
      operational(parsed.error, typeof parsed.hint === "string" ? parsed.hint : undefined);
    }
  }
  operational(firstUsefulLine(text) || "backend request failed");
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

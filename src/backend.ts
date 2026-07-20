import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { operational } from "./errors.js";
import { isObject, type BackendResult, type BackendRunner, type JsonObject } from "./shared.js";

const BACKEND = "codebase-memory-mcp";
const require = createRequire(import.meta.url);

function backendInvocation(args: string[]): { command: string; args: string[] } {
  try {
    const packageDirectory = dirname(require.resolve("codebase-memory-mcp/package.json"));
    const binary = join(
      packageDirectory,
      "bin",
      process.platform === "win32" ? `${BACKEND}.exe` : BACKEND,
    );
    if (existsSync(binary)) return { command: binary, args };
    return {
      command: process.execPath,
      args: [require.resolve("codebase-memory-mcp/bin.js"), ...args],
    };
  } catch {
    return { command: BACKEND, args };
  }
}

export const runBackend: BackendRunner = (args, signal) =>
  new Promise((fulfill, reject) => {
    const invocation = backendInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
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
    child.once("error", (error) =>
      reject(new Error(`${BACKEND} failed to start: ${error.message}`)),
    );
    child.once("close", (status) => {
      signal?.removeEventListener("abort", abort);
      if (aborted) {
        reject(
          signal?.reason instanceof Error ? signal.reason : new Error("Backend request cancelled"),
        );
        return;
      }
      fulfill({ stdout, stderr, status: status ?? 1 });
    });
  });

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

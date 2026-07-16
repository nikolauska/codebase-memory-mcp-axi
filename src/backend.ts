import { spawn } from "node:child_process";
import { operational } from "./errors.js";
import { isObject, type BackendResult, type BackendRunner, type JsonObject } from "./shared.js";

const BACKEND = "codebase-memory-mcp";

export const runBackend: BackendRunner = (args) =>
  new Promise((fulfill, reject) => {
    const child = spawn(BACKEND, args, {
      env: { ...process.env, CBM_LOG_LEVEL: "none" },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", (error) => reject(new Error(`${BACKEND} is not installed or not on PATH: ${error.message}`)));
    child.once("close", (status) => fulfill({ stdout, stderr, status: status ?? 1 }));
  });

export async function executeBackend(
  backend: BackendRunner,
  args: string[],
  allowFailure = false,
): Promise<BackendResult> {
  let result: BackendResult;
  try {
    result = await backend(args);
  } catch (error) {
    operational(error instanceof Error ? error.message : String(error));
  }
  if (!allowFailure && result.status !== 0 && result.stderr.trim()) operational(result.stderr.trim());
  if (!allowFailure && result.status !== 0 && !result.stdout.trim()) operational(`backend exited with status ${result.status}`);
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
  return value.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("level=") && !line.startsWith("warning:")) ?? "";
}

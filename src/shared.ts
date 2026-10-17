export type JsonObject = Record<string, unknown>;

export interface BackendResult {
  stdout: string;
  stderr: string;
  status: number;
  /** Set when the process was killed by a signal instead of exiting. */
  signal?: string;
}

export type BackendRunner = (args: string[], signal?: AbortSignal) => Promise<BackendResult>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

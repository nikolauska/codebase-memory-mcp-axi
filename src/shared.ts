export type JsonObject = Record<string, unknown>;

export interface BackendResult {
  stdout: string;
  stderr: string;
  status: number;
}

export type BackendRunner = (args: string[], signal?: AbortSignal) => Promise<BackendResult>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

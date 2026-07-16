import { AxiError } from "axi-sdk-js";

export function validation(message: string, suggestion = "Run `cbm-axi --help`"): never {
  throw new AxiError(message, "VALIDATION_ERROR", [suggestion]);
}

export function operational(
  message: string,
  suggestion = "Confirm `codebase-memory-mcp` is installed and on PATH",
): never {
  throw new AxiError(message || "command failed", "BACKEND_ERROR", [suggestion]);
}

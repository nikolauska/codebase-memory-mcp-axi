import { AxiError } from "axi-sdk-js";

export function validation(message: string, suggestion = "Run `cbm-axi --help`"): never {
  throw new AxiError(message, "VALIDATION_ERROR", [suggestion]);
}

export function operational(
  message: string,
  suggestion = "Reinstall `@nikolauska/cbm-axi` so its bundled backend is available",
): never {
  throw new AxiError(message || "command failed", "BACKEND_ERROR", [suggestion]);
}

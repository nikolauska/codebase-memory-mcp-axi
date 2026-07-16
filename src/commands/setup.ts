import type { AxiCliCommand, InstallSessionStartHooksOptions } from "axi-sdk-js";
import { operational, validation } from "../errors.js";

export function createSetupCommand(
  installHooks: (options?: InstallSessionStartHooksOptions) => void,
): AxiCliCommand<undefined> {
  return async (args) => {
    if (args.length !== 1 || args[0] !== "hooks") {
      validation("setup requires `hooks`", "Run `cbm-axi setup hooks`");
    }
    const errors: string[] = [];
    installHooks({
      marker: "cbm-axi",
      binaryNames: ["cbm-axi"],
      onError: (message) => errors.push(message),
    });
    if (errors.length > 0)
      operational(errors.join("; "), "Run `cbm-axi setup hooks` after fixing the reported files");
    return { setup: "hooks installed or already up to date" };
  };
}

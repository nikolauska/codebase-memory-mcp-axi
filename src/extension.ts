import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  truncateLine,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { encode } from "@toon-format/toon";
import { Type } from "typebox";
import { runBackend } from "./backend.js";
import { TOOL_NAMES, toolCommand } from "./commands/tool.js";
import type { BackendRunner, JsonObject } from "./shared.js";

const parameters = Type.Object({
  action: StringEnum(TOOL_NAMES, {
    description: "Codebase-memory operation to run",
  }),
  args: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: "Arguments accepted by the selected operation",
      },
    ),
  ),
  fields: Type.Optional(
    Type.Array(Type.String(), {
      description: "Response fields to retain for smaller output",
    }),
  ),
  full: Type.Optional(
    Type.Boolean({
      description:
        "Disable normal detail truncation; very large output is saved to a temporary file",
    }),
  ),
});

export function registerCbmExtension(pi: ExtensionAPI, backend: BackendRunner = runBackend): void {
  pi.registerTool({
    name: "cbm_axi",
    label: "Codebase Memory",
    description:
      "Query the local codebase-memory graph for projects, symbols, snippets, architecture, paths, and indexing state. Returns compact TOON output.",
    promptSnippet: "Query the indexed codebase-memory graph with compact structured output",
    promptGuidelines: [
      "Use cbm_axi to search the indexed graph before broadly reading source files.",
    ],
    parameters,
    async execute(_toolCallId, params, signal) {
      const args = params.args ? [JSON.stringify(params.args)] : [];
      if (params.fields?.length) args.push("--fields", params.fields.join(","));
      if (params.full) args.push("--full");

      const value = await toolCommand(params.action, args, backend, {
        signal,
        surface: "pi",
      });
      const text = typeof value === "string" ? value : encode(value as JsonObject);
      const truncation = truncateHead(text, {
        maxBytes: DEFAULT_MAX_BYTES,
        maxLines: DEFAULT_MAX_LINES,
      });

      if (!truncation.truncated) {
        return {
          content: [{ type: "text", text }],
          details: { action: params.action },
        };
      }

      const directory = await mkdtemp(join(tmpdir(), "cbm-axi-"));
      const outputPath = join(directory, `${params.action}.toon`);
      await writeFile(outputPath, text, "utf8");
      const preview = truncation.firstLineExceedsLimit
        ? truncateLine(text.split("\n", 1)[0], 4000).text
        : truncation.content;
      const previewLines = preview ? preview.split("\n").length : 0;
      const previewBytes = Buffer.byteLength(preview);
      const notice =
        `\n\n[Output truncated: ${previewLines} of ${truncation.totalLines} lines ` +
        `(${formatSize(previewBytes)} of ${formatSize(truncation.totalBytes)}). ` +
        `Full output saved to: ${outputPath}]`;

      return {
        content: [{ type: "text", text: preview + notice }],
        details: { action: params.action },
      };
    },
  });
}

export default function cbmExtension(pi: ExtensionAPI): void {
  registerCbmExtension(pi);
}

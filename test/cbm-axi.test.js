import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import { run } from "../dist/cli.js";
import { currentProject } from "../dist/commands/dashboard.js";
import { serializeToolArgs } from "../dist/commands/tool.js";
import { registerCbmExtension } from "../dist/extension.js";

function capture() {
  let output = "";
  return {
    stdout: { write: (chunk) => (output += chunk) },
    output: () => output,
  };
}

function backend(handler) {
  return async (args, signal) => ({ status: 0, stderr: "", ...handler(args, signal) });
}

test.afterEach(() => {
  process.exitCode = undefined;
});

test("serializes upstream flags and Windows paths", () => {
  assert.deepEqual(
    serializeToolArgs([
      "--repo-path",
      String.raw`C:\Users\niko\repo`,
      "--depth",
      "2",
      "--semantic-query",
      '["send"]',
    ]),
    ['{"repo_path":"C:/Users/niko/repo","depth":2,"semantic_query":["send"]}'],
  );
});

test("selects the closest indexed project", () => {
  assert.equal(
    currentProject(
      {
        projects: [
          { name: "parent", root_path: "/repo" },
          { name: "child", root_path: "/repo/packages/child" },
        ],
      },
      "/repo/packages/child/src",
    ),
    "child",
  );
});

test("registers a native pi tool backed by the package adapter", async () => {
  let tool;
  const controller = new AbortController();
  registerCbmExtension(
    { registerTool: (definition) => (tool = definition) },
    backend((args, signal) => {
      assert.equal(signal, controller.signal);
      assert.deepEqual(args, [
        "cli",
        "--json",
        "search_graph",
        '{"project":"demo","query":"adapter","limit":20}',
      ]);
      return {
        stdout: JSON.stringify({
          structuredContent: { total: 1, results: [{ name: "registerCbmExtension" }] },
        }),
      };
    }),
  );

  assert.equal(tool.name, "cbm_axi");
  const result = await tool.execute(
    "call-1",
    {
      action: "search_graph",
      args: { project: "demo", query: "adapter" },
    },
    controller.signal,
  );
  assert.match(result.content[0].text, /results\[1\]\{name,qualified_name,label,file_path\}/);
  assert.match(result.content[0].text, /registerCbmExtension/);
});

test("keeps a preview when a TOON line exceeds the output limit", async () => {
  let tool;
  registerCbmExtension(
    { registerTool: (definition) => (tool = definition) },
    backend(() => ({
      stdout: JSON.stringify({ structuredContent: { source: "x".repeat(60_000) } }),
    })),
  );

  const result = await tool.execute("call-2", {
    action: "get_code_snippet",
    full: true,
  });
  const text = result.content[0].text;
  assert.match(text, /^source: x+/);
  assert.match(text, /\[truncated\]/);
  const outputPath = /Full output saved to: (.+)]$/.exec(text)?.[1];
  assert.ok(outputPath);
  await rm(dirname(outputPath), { recursive: true, force: true });
});

test("runs MCP tools through the SDK and compacts output", async () => {
  const io = capture();
  await run(["search_graph", "--project", "demo"], {
    version: "0.3.0",
    stdout: io.stdout,
    backend: backend((args) => {
      assert.deepEqual(args, ["cli", "--json", "search_graph", '{"project":"demo","limit":20}']);
      return {
        stdout: JSON.stringify({
          structuredContent: {
            total: 1,
            has_more: false,
            results: [
              {
                name: "Search",
                qualified_name: "demo.Search",
                label: "Function",
                file_path: "main.ts",
                ignored: true,
              },
            ],
          },
        }),
      };
    }),
  });
  assert.match(io.output(), /results\[1\]\{name,qualified_name,label,file_path\}/);
  assert.doesNotMatch(io.output(), /ignored/);
});

test("uses SDK errors and exit code two for invalid input", async () => {
  const io = capture();
  await run(["search_graph", "--fields"], { version: "0.3.0", stdout: io.stdout });
  assert.equal(process.exitCode, 2);
  assert.match(io.output(), /--fields requires a value/);
  assert.match(io.output(), /VALIDATION_ERROR/);
});

test("maps backend errors to operational failures", async () => {
  const io = capture();
  await run(["index_status", "--project", "missing"], {
    version: "0.3.0",
    stdout: io.stdout,
    backend: backend(() => ({
      status: 1,
      stdout: JSON.stringify({
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "project not found", hint: "Run list_projects first" }),
          },
        ],
      }),
    })),
  });
  assert.equal(process.exitCode, 1);
  assert.match(io.output(), /project not found/);
  assert.match(io.output(), /Run list_projects first/);
});

test("truncates snippets and emits a full-output hint", async () => {
  const io = capture();
  await run(["get_code_snippet", "--project", "demo"], {
    version: "0.3.0",
    stdout: io.stdout,
    backend: backend(() => ({
      stdout: JSON.stringify({
        structuredContent: { name: "Search", source: "x".repeat(1001), secret: "hidden" },
      }),
    })),
  });
  assert.match(io.output(), /truncated, 1001 chars total/);
  assert.match(io.output(), /--full/);
  assert.doesNotMatch(io.output(), /secret/);
});

test("delegates tool help to the backend", async () => {
  const io = capture();
  await run(["search_graph", "--help"], {
    version: "0.3.0",
    stdout: io.stdout,
    backend: backend((args) => {
      assert.deepEqual(args, ["cli", "search_graph", "--help"]);
      return { stdout: "prefix\nUsage: backend help\n" };
    }),
  });
  assert.equal(io.output(), "Usage: backend help\n\n");
});

test("forwards future tools through the tool command", async () => {
  const io = capture();
  await run(["tool", "future_tool", "--value", "ok"], {
    version: "0.3.0",
    stdout: io.stdout,
    backend: backend((args) => {
      assert.deepEqual(args, ["cli", "--json", "future_tool", '{"value":"ok"}']);
      return { stdout: JSON.stringify({ structuredContent: { status: "ok" } }) };
    }),
  });
  assert.match(io.output(), /status: ok/);
});

test("installs SDK hooks through setup hooks", async () => {
  const io = capture();
  let options;
  await run(["setup", "hooks"], {
    version: "0.3.0",
    stdout: io.stdout,
    installHooks: (value) => (options = value),
  });
  assert.equal(options.marker, "cbm-axi");
  assert.deepEqual(options.binaryNames, ["cbm-axi"]);
  assert.match(io.output(), /hooks installed or already up to date/);
});

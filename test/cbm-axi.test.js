import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../dist/cli.js";
import { currentProject } from "../dist/commands/dashboard.js";
import { serializeToolArgs } from "../dist/commands/tool.js";

function capture() {
  let output = "";
  return {
    stdout: { write: (chunk) => (output += chunk) },
    output: () => output,
  };
}

function backend(handler) {
  return async (args) => ({ status: 0, stderr: "", ...handler(args) });
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

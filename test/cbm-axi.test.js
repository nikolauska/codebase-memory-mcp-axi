import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { requireBackendVersion } from "../dist/backend.js";
import { run } from "../dist/cli.js";
import { currentProjects } from "../dist/commands/dashboard.js";
import { serializeToolArgs } from "../dist/tool-args.js";

function capture() {
  let output = "";
  return {
    stdout: { write: (chunk) => (output += chunk) },
    output: () => output,
  };
}

function backend(handler) {
  return async (args, signal) => {
    if (args[0] === "--version")
      return { status: 0, stderr: "", stdout: "codebase-memory-mcp 0.11.0\n" };
    return { status: 0, stderr: "", ...handler(args, signal) };
  };
}

function structured(value, isError = false) {
  return JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  });
}

async function runWith(argv, handler) {
  const io = capture();
  await run(argv, { version: "0.8.0", stdout: io.stdout, backend: backend(handler) });
  return io.output();
}

test.afterEach(() => {
  process.exitCode = undefined;
});

test("preserves upstream flags and normalizes Windows paths", () => {
  assert.deepEqual(
    serializeToolArgs([
      "--repo-path",
      String.raw`C:\Users\niko\repo`,
      "--depth",
      "2",
      "--semantic-query",
      '["send"]',
    ]),
    ["--repo-path", "C:/Users/niko/repo", "--depth", "2", "--semantic-query", '["send"]'],
  );
});

test("requires codebase-memory-mcp 0.11.0 or newer", async () => {
  const calls = [];
  const compatible = requireBackendVersion(async (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "codebase-memory-mcp 0.11.0\n" };
  });
  await compatible(["cli", "--json", "list_projects"]);
  assert.deepEqual(calls, [["--version"], ["cli", "--json", "list_projects"]]);

  for (const version of ["0.10.8", "v0.11.0-rc.1", "not a version"]) {
    const unsupported = requireBackendVersion(async () => ({
      status: 0,
      stderr: "",
      stdout: `codebase-memory-mcp ${version}\n`,
    }));
    await assert.rejects(unsupported(["cli", "--json", "list_projects"]), /0\.11\.0 or newer/);
  }
});

test("selects every project on the closest indexed root", () => {
  assert.deepEqual(
    currentProjects(
      [
        { name: "parent", root_path: "/repo" },
        { name: "child", root_path: "/repo/packages/child" },
        { name: "child-renamed", root_path: "/repo/packages/child" },
      ],
      "/repo/packages/child/src",
    ).map((project) => project.name),
    ["child", "child-renamed"],
  );
});

test("requests JSON and renders upstream tables as TOON rows with a next-page command", async () => {
  const output = await runWith(["search_graph", "--project", "demo"], (args) => {
    assert.deepEqual(args, [
      "cli",
      "--json",
      "search_graph",
      "--project",
      "demo",
      "--limit",
      "20",
      "--format",
      "json",
    ]);
    return {
      stdout: structured({
        cols: ["qn", "label", "file"],
        rows: [["demo.Search", "Function", "main.ts"]],
        total: 21,
        has_more: true,
        next_offset: 20,
      }),
    };
  });
  assert.match(output, /results\[1\]\{qn,label,file\}:\n {2}demo\.Search,Function,main\.ts/);
  assert.match(
    output,
    /cbm-axi search_graph --project demo --limit 20 --offset 20` for more results/,
  );
  assert.doesNotMatch(output, /next_offset/);
});

test("drops restated upstream bookkeeping but keeps inexact totals", async () => {
  const output = await runWith(["search_graph", "--project", "demo", "--query", "x"], () => ({
    stdout: structured({
      cols: ["qn", "rank"],
      rows: [["demo.X", -13.026651451184177]],
      total: 1,
      total_relation: "eq",
      semantic_total_relation: "gte",
      offset: 0,
      returned: 1,
      count: 1,
      has_more: false,
      truncated: false,
      elapsed_ms: 12,
    }),
  }));
  assert.match(output, /demo\.X,-13\.03\n/);
  assert.match(output, /semantic_total_relation: gte/);
  assert.doesNotMatch(output, /total_relation: eq|count:|offset:|truncated|elapsed_ms/);
});

test("suggests the usual next command after results but not after an empty search", async () => {
  const found = await runWith(["search_graph", "--project", "demo", "--query", "x"], () => ({
    stdout: structured({ cols: ["qn"], rows: [["demo.X"]], has_more: false }),
  }));
  assert.match(found, /cbm-axi get_code_snippet --project demo --qualified-name <qn>` for source/);

  const empty = await runWith(["search_graph", "--project", "demo", "--query", "x"], () => ({
    stdout: structured({ cols: ["qn"], rows: [], has_more: false }),
  }));
  assert.doesNotMatch(empty, /get_code_snippet/);
});

test("rebuilds qualified names in grouped rows and replaces the previous cursor", async () => {
  const output = await runWith(
    ["trace_path", "--project", "demo", "--function-name", "run", "--cursor", "old"],
    () => ({
      stdout: structured({
        callers: {
          qn_rule: 'qn = qn_prefix == "" ? name : qn_prefix + "." + name',
          cols: ["name", "hop"],
          groups: [
            { qn_prefix: "demo.cli", rows: [["main", 1]] },
            { qn_prefix: "", rows: [["root", 2]] },
          ],
        },
        has_more: true,
        next_cursor: "c1.next",
      }),
    }),
  );
  assert.match(output, /callers\[2\]\{qn,hop\}:\n {2}demo\.cli\.main,1\n {2}root,2/);
  assert.match(output, /--function-name run --cursor c1\.next` for more trace rows/);
  assert.doesNotMatch(output, /old/);
});

test("edits raw JSON arguments in place because the backend ignores extra flags", async () => {
  const output = await runWith(["search_graph", '{"project":"demo","query":"x"}'], (args) => {
    assert.deepEqual(args, [
      "cli",
      "--json",
      "search_graph",
      '{"project":"demo","query":"x","limit":20,"format":"json"}',
    ]);
    return {
      stdout: structured({ cols: ["qn"], rows: [["demo.X"]], has_more: true, next_offset: 20 }),
    };
  });
  assert.match(
    output,
    /'\{\\"project\\":\\"demo\\",\\"query\\":\\"x\\",\\"limit\\":20,\\"offset\\":20\}'/,
  );
});

test("rejects --format because cbm-axi owns the output format", async () => {
  const output = await runWith(["search_graph", "--project", "demo", "--format", "tree"], () =>
    assert.fail("backend must not be called"),
  );
  assert.equal(process.exitCode, 2);
  assert.match(output, /--format is managed by cbm-axi/);
});

test("reports backend usage failures as validation errors with cbm-axi help", async () => {
  const unknownFlag = await runWith(["search_graph", "--project", "demo", "--bogus", "1"], () => ({
    status: 1,
    stdout: "",
    stderr:
      "error: unknown flag --bogus for this tool — run 'cli search_graph --help' for the supported flags\n",
  }));
  assert.equal(process.exitCode, 2);
  assert.match(unknownFlag, /unknown flag --bogus/);
  assert.match(unknownFlag, /Run `cbm-axi search_graph --help`/);

  process.exitCode = undefined;
  const missing = await runWith(["index_status"], () => ({
    status: 1,
    stdout: structured(
      { error: "missing required argument: project", hint: 'Pass {"project":"<name>"}' },
      true,
    ),
  }));
  assert.equal(process.exitCode, 2);
  assert.match(missing, /VALIDATION_ERROR/);
  assert.match(missing, /Run `cbm-axi index_status --help`/);
});

test("maps backend errors to operational failures", async () => {
  const output = await runWith(["index_status", "--project", "missing"], () => ({
    status: 1,
    stdout: structured({ error: "project not found", hint: "Run list_projects first" }, true),
  }));
  assert.equal(process.exitCode, 1);
  assert.match(output, /project not found/);
  assert.match(output, /Run list_projects first/);
});

test("treats deleting an absent project as success", async () => {
  const output = await runWith(["delete_project", "--project", "gone"], () => ({
    status: 1,
    stdout: structured({ project: "gone", status: "not_found" }, true),
  }));
  assert.equal(process.exitCode, undefined);
  assert.match(output, /already absent \(no-op\)/);
});

test("keeps upstream-bounded snippet source whole and continues it by line", async () => {
  const source = "x".repeat(1500);
  const output = await runWith(
    ["get_code_snippet", "--project", "demo", "--qualified-name", "Run"],
    () => ({
      stdout: structured({ name: "Run", source, source_truncated: true, next_start_line: 41 }),
    }),
  );
  assert.ok(output.includes(source));
  assert.doesNotMatch(output, /--full/);
  assert.match(output, /--qualified-name Run --start-line 41` for more source/);
});

test("previews other long text and offers --full", async () => {
  const output = await runWith(["manage_adr", "--project", "demo", "--mode", "get"], () => ({
    stdout: structured({ content: "y".repeat(1001) }),
  }));
  assert.match(output, /truncated, 1001 chars total/);
  assert.match(output, /cbm-axi manage_adr --project demo --mode get --full/);
});

test("states empty results with their project scope", async () => {
  const output = await runWith(["search_graph", "--project", "demo", "--query", "none"], () => ({
    stdout: structured({ cols: ["qn"], rows: [], total: 0, has_more: false }),
  }));
  assert.match(output, /results: 0 found in project demo/);
  assert.match(output, /cbm-axi search_graph --help/);
});

test("adapts backend tool help to cbm-axi usage", async () => {
  const output = await runWith(["search_graph", "--help"], (args) => {
    assert.deepEqual(args, ["cli", "search_graph", "--help"]);
    return {
      stdout: [
        "prefix",
        "Usage:",
        "  codebase-memory-mcp cli search_graph --flag value",
        "  echo '<json>' | codebase-memory-mcp cli search_graph",
        "Flags:",
        "  --project <string> [required]",
        "  --format <tree|json> [default: tree]",
        "",
      ].join("\n"),
    };
  });
  assert.match(output, /\nUsage:\n {2}cbm-axi search_graph --flag value\nFlags:\n {2}--project/);
  assert.doesNotMatch(output, /echo|--format|codebase-memory-mcp cli/);
  assert.match(output, /cbm-axi flags:\n {2}--fields/);
});

test("forwards future tools through the tool command without a format flag", async () => {
  const output = await runWith(["tool", "future_tool", "--value", "ok"], (args) => {
    assert.deepEqual(args, ["cli", "--json", "future_tool", "--value", "ok"]);
    return { stdout: structured({ status: "ok" }) };
  });
  assert.match(output, /status: ok/);
});

function dashboardBackend(projectPages, statuses, generations) {
  return (args) => {
    const project = args[args.indexOf("--project") + 1];
    if (args[2] === "list_projects") {
      const offset = Number(args[args.indexOf("--offset") + 1]);
      return { stdout: structured(projectPages[offset === 0 ? 0 : 1]) };
    }
    if (args[2] === "index_status") return { stdout: structured(statuses[project]) };
    if (args[2] === "check_index_coverage") {
      if (generations[project] === undefined)
        return { status: 1, stdout: structured({ error: "coverage unavailable" }, true) };
      return { stdout: structured({ metadata: { generation: generations[project] } }) };
    }
    assert.fail(`unexpected backend call: ${args.join(" ")}`);
  };
}

test("dashboard finds the current project beyond the first project page", async () => {
  const output = await runWith(
    [],
    dashboardBackend(
      [
        {
          projects: [{ name: "other", root_path: "/elsewhere" }],
          has_more: true,
          next_offset: 500,
        },
        { projects: [{ name: "here", root_path: process.cwd() }], has_more: false },
      ],
      { here: { status: "ready", nodes: 3, edges: 2, not_indexed: { files_count: 0 } } },
      { here: "2026-09-26T19:54:45Z" },
    ),
  );
  assert.match(output, /project: here\nstatus: ready\nnodes: 3\nedges: 2\nhelp/);
  assert.doesNotMatch(output, /not_indexed|rebuild/);
});

test("dashboard prefers the newest project on a shared root and lists the others", async () => {
  const root = process.cwd();
  const output = await runWith(
    [],
    dashboardBackend(
      [
        {
          projects: [
            { name: "old", root_path: root },
            { name: "new", root_path: root },
          ],
          has_more: false,
        },
      ],
      {
        old: { status: "ready", indexed_at: "2026-07-10T14:58:39Z" },
        new: { status: "ready", indexed_at: "2026-09-26T19:54:45Z" },
      },
      { old: "", new: "2026-09-26T19:54:45Z" },
    ),
  );
  assert.match(output, /project: new\n/);
  assert.match(output, /also_indexed_here\[1\]: old/);
  assert.doesNotMatch(output, /rebuild/);
});

test("dashboard flags an index built before generation tracking and offers a rebuild", async () => {
  const output = await runWith(
    [],
    dashboardBackend(
      [{ projects: [{ name: "legacy", root_path: process.cwd() }], has_more: false }],
      { legacy: { status: "ready" } },
      { legacy: "" },
    ),
  );
  assert.match(output, /index: built before generation tracking/);
  assert.match(
    output,
    /help\[4\]: Run `cbm-axi index_repository --repo-path \S+ --name legacy` to rebuild/,
  );
});

test("dashboard still renders when the coverage probe fails", async () => {
  const output = await runWith(
    [],
    dashboardBackend(
      [{ projects: [{ name: "here", root_path: process.cwd() }], has_more: false }],
      { here: { status: "ready" } },
      {},
    ),
  );
  assert.equal(process.exitCode, undefined);
  assert.match(output, /project: here\nstatus: ready/);
});

test("reports a missing MCP binary even when XDG_RUNTIME_DIR is not a directory", () => {
  const result = spawnSync(process.execPath, ["dist/bin/cbm-axi.js", "list_projects"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "", CBM_RUNTIME_DIR: "", XDG_RUNTIME_DIR: process.execPath },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /codebase-memory-mcp failed to start/);
  assert.match(result.stdout, /Install `codebase-memory-mcp` globally/);
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

# cbm-axi

Agent-oriented Node.js CLI for compact codebase-memory graph queries. It wraps the separately installed `codebase-memory-mcp` binary and uses [`axi-sdk-js`](https://www.npmjs.com/package/axi-sdk-js) for command dispatch, official TOON output, structured errors, updates, and optional agent hooks.

## Install

Install the MCP server and AXI as separate standalone binaries on `PATH`:

```sh
npm install --global codebase-memory-mcp
npm install --global @nikolauska/cbm-axi
```

`cbm-axi` only detects and invokes `codebase-memory-mcp`; it never installs,
downloads, updates, or otherwise manages the MCP server.

Node.js 24 or newer is required. To build `cbm-axi` from source:

```sh
git clone https://github.com/nikolauska/codebase-memory-mcp-axi.git
cd codebase-memory-mcp-axi
npm ci
npm run build
npm install --global .
```

Session hooks are an explicit, optional integration:

```sh
cbm-axi setup hooks
```

The command idempotently installs or repairs user-level session-start hooks for
Claude Code, Codex, and OpenCode. Hooks resolve `cbm-axi` from `PATH` when it
identifies the current executable and otherwise retain its absolute path.

As a lower-overhead alternative, install the static [`cbm-axi` skill](skills/cbm-axi/SKILL.md):

```sh
skills add nikolauska/codebase-memory-mcp-axi --skill cbm-axi
```

Hooks provide ambient session context; the skill loads on demand. Install either
integration or both after installing the standalone binaries.

## Use

```sh
cbm-axi
cbm-axi list_projects
cbm-axi index_repository --repo-path "$PWD"
cbm-axi search_graph --project <project> --query "resource command"
cbm-axi get_code_snippet --project <project> --qualified-name <qualified-name> --full
cbm-axi trace_path --project <project> --function-name <name> --direction both
cbm-axi get_architecture --project <project>
cbm-axi query_graph --project <project> --query "MATCH (f:Function) RETURN f.name LIMIT 20"
cbm-axi update --check
```

All upstream MCP tools are available as matching subcommands. Use `cbm-axi tool <name>` for a forward-compatible invocation. Add `--fields a,b` for a smaller output projection and `--full` to disable detail truncation. Piped JSON and `--args-file` are passed through to the upstream CLI.

Errors are structured on stdout. Diagnostics stay on stderr. Exit codes are `0` for success, `1` for operational failures, and `2` for usage errors. `cbm-axi update` upgrades a global npm installation; use `cbm-axi update --check` for a read-only version check.

## Develop

Install the Node.js version pinned by [mise](https://mise.jdx.dev/):

```sh
mise install
```

Then install dependencies and run the npm scripts:

```sh
npm ci
npm run lint
npm test
npm run build
npm pack --dry-run
```

# cbm-axi

Agent-oriented Node.js CLI and pi extension for compact codebase-memory graph queries. It wraps the package-local `codebase-memory-mcp` backend and uses [`axi-sdk-js`](https://www.npmjs.com/package/axi-sdk-js) for command dispatch, official TOON output, structured errors, updates, and optional agent hooks.

## Install

### pi

Install the native pi extension, skill, and backend with one command:

```sh
pi install npm:@nikolauska/cbm-axi
```

The extension registers the `cbm_axi` tool and uses the package-local `codebase-memory-mcp` backend. No global executable installation is required.

### Standalone CLI

```sh
npm install --global @nikolauska/cbm-axi
```

The npm dependency installs the platform-specific `codebase-memory-mcp` backend automatically. Node.js 24 or newer is required. To build from source:

```sh
git clone https://github.com/nikolauska/codebase-memory-mcp-axi.git
cd codebase-memory-mcp-axi
npm ci
npm run build
npm install --global .
```

Optionally run `cbm-axi setup hooks` to install user-level session hooks for Claude Code, Codex, and OpenCode.

### Claude Code, Codex, and GitHub Copilot CLI plugins

Add and install the marketplace plugin:

```text
# Claude Code
/plugin marketplace add nikolauska/codebase-memory-mcp-axi
/plugin install cbm-axi@codebase-memory-mcp-axi

# Codex
codex plugin marketplace add nikolauska/codebase-memory-mcp-axi
codex plugin add cbm-axi@codebase-memory-mcp-axi

# GitHub Copilot CLI
copilot plugin marketplace add nikolauska/codebase-memory-mcp-axi
copilot plugin install cbm-axi@codebase-memory-mcp-axi
```

The plugin installs the skill and bundled session hooks. It does not install the npm package;
install `@nikolauska/cbm-axi` globally before using it. The package includes the backend dependency.
Uninstalling the plugin removes its skill and hooks. Any user-level hooks created by
`cbm-axi setup hooks` must be removed separately.

`setup hooks` installs idempotent user-level session-start integrations for Claude Code, Codex, and OpenCode. The repository also includes the installable [`cbm-axi` skill](skills/cbm-axi/SKILL.md). Use either the hooks or the skill; both are not required.

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

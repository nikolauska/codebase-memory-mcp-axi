# cbm-axi

Agent-oriented codebase-memory-mcp CLI written in Go. It wraps the installed `codebase-memory-mcp` executable and emits compact TOON on stdout while keeping JSON internally.

## Install

Install `codebase-memory-mcp` first:

```sh
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --skip-config
```

See the [codebase-memory-mcp installation instructions](https://github.com/DeusData/codebase-memory-mcp#quick-start) for Windows and other installation methods.

Then install `cbm-axi` separately:

```sh
npm install --global @nikolauska/cbm-axi
```

Or build it from source:

```sh
git clone https://github.com/nikolauska/codebase-memory-mcp-axi.git
cd codebase-memory-mcp-axi
make install
```

Both executables must be available on `PATH`. Optionally run `cbm-axi setup` to install user-level session hooks for Claude Code, Codex, and OpenCode.

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

The plugin installs the skill and bundled session hooks. It does not install either executable;
install `cbm-axi` and `codebase-memory-mcp` separately and ensure both are on `PATH` before using it.
Uninstalling the plugin removes its skill and hooks. Any user-level hooks created by
`cbm-axi setup` must be removed separately.

`setup` installs idempotent user-level session integrations for Claude Code, Codex, and OpenCode. The repository also includes the installable [`cbm-axi` skill](skills/cbm-axi/SKILL.md). Use either the hooks or the skill; both are not required.

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
```

All upstream MCP tools are available as matching subcommands. Use `cbm-axi tool <name>` for a forward-compatible invocation. Add `--fields a,b` for a smaller output projection and `--full` to disable detail truncation. Piped JSON and `--args-file` are passed through to the upstream CLI.

Errors are structured on stdout. Diagnostics stay on stderr. Exit codes are `0` for success, `1` for operational failures, and `2` for usage errors.

## Develop

```sh
make fmt
make test
make lint
make check-skill
make build
```

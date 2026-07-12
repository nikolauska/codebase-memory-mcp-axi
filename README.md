# cbm-axi

Agent-oriented codebase-memory-mcp CLI written in Go. It wraps the installed `codebase-memory-mcp` executable and emits compact TOON on stdout while keeping JSON internally.

## Install

Requires the upstream `codebase-memory-mcp` binary on `PATH`.

```sh
git clone https://github.com/nikolauska/codebase-memory-mcp-axi.git
cd codebase-memory-mcp-axi
make install
cbm-axi setup
```

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

The plugin installs the skill and lazily downloads both executables into its writable local plugin
data directory on first use. Nothing is added to your global `PATH`. For a standalone checkout,
run the installer directly:

```sh
./scripts/install.sh
# Windows PowerShell: .\scripts\install.ps1
```

The installer downloads the verified `cbm-axi` release declared by the plugin manifest and its
pinned, compatible `codebase-memory-mcp` release. When run by the plugin it uses
`PLUGIN_DATA`/`CLAUDE_PLUGIN_DATA`; standalone use defaults to `~/.local/bin` (or the platform
equivalent). Updated plugin or backend versions are installed on the next launch. Plugin hooks are
bundled and removed with the plugin. `cbm-axi setup` remains available for legacy user-level hook
setup outside the plugin.

To remove everything installed by the plugin, uninstall the plugin from Claude Code, Codex, or
GitHub Copilot CLI. The plugin-managed binaries and hooks are then removed with its plugin data and
bundle; any legacy hooks created by `cbm-axi setup` must be removed separately.

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

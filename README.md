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
equivalent). Plugin-managed installs keep the graph cache under the same writable data directory.
Updated plugin or backend versions are installed on the next launch. Plugin hooks are
bundled and removed with the plugin. `cbm-axi setup` remains available for legacy user-level hook
setup outside the plugin.

#### Allow graph-cache writes

The graph database is stored under `<plugin-data>/cache`. Replace `<plugin-data>` below with the
absolute plugin data directory for your installation: the directory containing the plugin-managed
`bin/` and `cache/` directories. These permissions must be configured by the user; a plugin cannot
grant itself access outside the current workspace.

For Claude Code, add the directory to `~/.claude/settings.json`. When Bash sandboxing is enabled,
also allow writes at the sandbox boundary:

```json
{
  "permissions": {
    "additionalDirectories": ["<plugin-data>"]
  },
  "sandbox": {
    "filesystem": {
      "allowWrite": ["<plugin-data>"]
    }
  }
}
```

For one session, `claude --add-dir "<plugin-data>"` adds the directory, but the sandbox write rule
still applies when sandboxing is enabled. See the [Claude Code settings reference](https://code.claude.com/docs/en/settings).

For Codex, add the absolute directory to `~/.codex/config.toml`, then start a new session:

```toml
[sandbox_workspace_write]
writable_roots = ["<plugin-data>"]
```

See the [Codex sandbox configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#approval-policies-and-sandbox-modes).

For GitHub Copilot CLI, use `/add-dir <plugin-data>` in a session or start with
`copilot --add-dir="<plugin-data>"`. To persist access for a repository, add the absolute directory
to that repository's `allowed_directories` entry in `~/.copilot/permissions-config.json` while
Copilot CLI is stopped:

```json
{
  "locations": {
    "<absolute-repository-path>": {
      "allowed_directories": ["<plugin-data>"]
    }
  }
}
```

If Copilot CLI's local sandbox is enabled, open `/sandbox`, select **Filesystem**, and add the same
directory with read/write access. Directory access and command approval are separate. See the
[Copilot CLI configuration reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)
and [local sandbox settings](https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/configuring-local-sandbox-settings).

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

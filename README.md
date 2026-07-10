# cbm-axi

Agent-oriented codebase-memory-mcp CLI written in Go. It wraps the installed `codebase-memory-mcp` executable and emits compact TOON on stdout while keeping JSON internally.

## Install

Requires the upstream `codebase-memory-mcp` binary on `PATH`.

```sh
go install github.com/nikolauska/codebase-memory-mcp-axi@latest
cbm-axi setup
```

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

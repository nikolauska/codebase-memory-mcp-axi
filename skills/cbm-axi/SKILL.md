---
name: cbm-axi
description: >
  Use cbm-axi when exploring indexed codebases through codebase-memory-mcp,
  especially for compact search, tracing, architecture, and source inspection.
---

# cbm-axi

Use the `cbm-axi` CLI for compact, structured TOON output. Install
`codebase-memory-mcp` 0.10.2 or newer and `@nikolauska/cbm-axi` separately so
both binaries are on `PATH`; the AXI never installs or manages the MCP server.
Run `cbm-axi setup hooks` only when user-level session hooks are wanted. The
CLI never prompts.

## Workflow

1. Run `cbm-axi` to see read-only status for the current directory, then use
   `cbm-axi list_projects` and `cbm-axi index_status` for more detail.
2. If it is not indexed, run
   `cbm-axi index_repository --repo-path <path>`. If indexing fails because the
   user cache is not writable, ask for permission to retry with elevated
   filesystem access.
3. Use list_projects, index_status, and get_graph_schema to orient.
4. Use search_graph or search_code before reading source.
5. Use get_code_snippet after discovering an exact qualified name.
6. Use trace_path, query_graph, get_architecture, or detect_changes for
   relationships and impact.
7. Use `check_index_coverage` only when completeness matters or expected code
   is absent from search; it is a best-effort signal, not proof of completeness.

## CLI commands

```sh
cbm-axi
cbm-axi list_projects
cbm-axi index_repository --repo-path <path>
cbm-axi search_graph --project <project> --query "<terms>"
cbm-axi search_graph --project <project> --name-pattern ".*Handler.*"
cbm-axi get_code_snippet --project <project> --qualified-name <qualified-name>
cbm-axi trace_path --project <project> --function-name <name> --direction both
cbm-axi get_architecture --project <project>
cbm-axi check_index_coverage --project <project> --scopes .
cbm-axi query_graph --project <project> \
  --query "MATCH (f:Function) RETURN f.name LIMIT 20"
cbm-axi update --check
```

Use `--fields` for a smaller projection and `--full` when a detail response
reports truncation.

`CALLS` means a callable invocation. Query `CALL_REFERENCE` as well when the
task needs proven references to a callable passed as a value.

Search results default to 20 rows; follow `has_more` and the emitted next-page
guidance for more.

Successful data and errors are TOON on stdout. Exit code 0 means success, 1
means an operational failure, and 2 means invalid usage.

Run `cbm-axi <command> --help` for the upstream command's required flags and
examples.

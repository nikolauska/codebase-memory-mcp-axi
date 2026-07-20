---
name: cbm-axi
description: >
  Use cbm_axi or cbm-axi when exploring indexed codebases through
  codebase-memory-mcp, especially for compact search, tracing, architecture,
  and source inspection.
---

# cbm-axi

Prefer the native `cbm_axi` tool when available. Otherwise use the `cbm-axi`
CLI. Both provide compact, structured TOON output.

Install with `pi install npm:@nikolauska/cbm-axi` for the native pi tool, or
install `@nikolauska/cbm-axi` globally for the standalone CLI. The npm package
includes the codebase-memory-mcp backend. Run `cbm-axi setup hooks` only when
user-level session hooks are wanted. The CLI never prompts.

## Workflow

1. Call `list_projects` and `index_status` through `cbm_axi`, or run `cbm-axi`
   to see read-only status for the current directory.
2. If it is not indexed, call `index_repository` with `args.repo_path`, or run
   `cbm-axi index_repository --repo-path <path>`. If indexing fails because the
   user cache is not writable, ask for permission to retry with elevated
   filesystem access.
3. Use list_projects, index_status, and get_graph_schema to orient.
4. Use search_graph or search_code before reading source.
5. Use get_code_snippet after discovering an exact qualified name.
6. Use trace_path, query_graph, get_architecture, or detect_changes for
   relationships and impact.

## Native pi tool

Call `cbm_axi` with an `action` and optional `args`, `fields`, or `full`
values. For example:

```json
{"action":"search_graph","args":{"project":"demo","query":"handler"}}
{"action":"get_code_snippet","args":{"project":"demo","qualified_name":"demo.Handler"},"full":true}
```

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
cbm-axi query_graph --project <project> \
  --query "MATCH (f:Function) RETURN f.name LIMIT 20"
cbm-axi update --check
```

Use `fields`/`--fields` for a smaller projection and `full`/`--full` when a
detail response reports truncation. Search results default to 20 rows; follow
`has_more` and the emitted next-page guidance for more.

All successful data and errors are TOON on stdout. Exit code 0 means success,
1 means an operational failure, and 2 means invalid usage.

Run `cbm-axi <command> --help` for the upstream command's required flags and
examples.

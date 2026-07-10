---
name: cbm-axi
description: Use cbm-axi when exploring indexed codebases through codebase-memory-mcp, especially for compact search, tracing, architecture, and source inspection.
---

# cbm-axi

Prefer cbm-axi over raw codebase-memory-mcp cli calls when an agent needs compact, structured TOON output.

The upstream codebase-memory-mcp binary must be installed and available on PATH. Run cbm-axi setup once to install user-level session hooks; use this skill instead when hooks are unavailable or undesirable. The CLI never prompts.

## Workflow

1. Run cbm-axi to see read-only status for the current directory.
2. If it is not indexed, run cbm-axi index_repository --repo-path <path>.
3. Use list_projects, index_status, and get_graph_schema to orient.
4. Use search_graph or search_code before reading source.
5. Use get_code_snippet after discovering an exact qualified name.
6. Use trace_path, query_graph, get_architecture, or detect_changes for relationships and impact.

## Commands

    cbm-axi
    cbm-axi list_projects
    cbm-axi index_repository --repo-path <path>
    cbm-axi search_graph --project <project> --query "<terms>"
    cbm-axi search_graph --project <project> --name-pattern ".*Handler.*"
    cbm-axi get_code_snippet --project <project> --qualified-name <qualified-name>
    cbm-axi trace_path --project <project> --function-name <name> --direction both
    cbm-axi get_architecture --project <project>
    cbm-axi query_graph --project <project> --query "MATCH (f:Function) RETURN f.name LIMIT 20"

Use --fields a,b for a smaller projection and --full when a detail response reports truncation. Search results default to 20 rows; follow has_more and the emitted next-page command for more.

All successful data and errors are TOON on stdout. Exit code 0 means success, 1 means an operational failure, and 2 means invalid usage.

Run cbm-axi <command> --help for the upstream command's required flags and examples.

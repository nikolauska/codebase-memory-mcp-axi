# How cbm-axi works

cbm-axi is an [Agent eXperience Interface (AXI)](https://github.com/kunchenguid/axi) for codebase-memory-mcp. It gives AI agents a compact command-line interface for indexing and exploring source-code graphs.

AXI tools are designed for AI agents rather than human-first terminal use. cbm-axi turns codebase-memory-mcp operations into structured commands with token-efficient output, predictable errors, and contextual next steps.

## Install cbm-axi

cbm-axi requires Node.js 24 or newer and codebase-memory-mcp 0.11.0 or newer. Install both commands globally with npm:

```sh
npm install --global codebase-memory-mcp
npm install --global @nikolauska/cbm-axi
```

Confirm that cbm-axi is available:

```sh
cbm-axi --help
```

cbm-axi invokes the separately installed backend. It does not install, update, start, stop, or otherwise manage codebase-memory-mcp.

For agent-specific setup and usage, see the [cbm-axi skill](../../skills/cbm-axi/SKILL.md).

## Add agent guidance

Install optional session-start hooks for Claude Code, Codex, and OpenCode with:

```sh
cbm-axi setup hooks
```

The hooks provide ambient session context. The portable cbm-axi skill provides the same kind of guidance on demand. Either integration can be used independently, or both can be installed.

## Prepare a codebase

An AI agent starts by checking cbm-axi from the repository it needs to understand. The dashboard reports whether the current directory belongs to an indexed project, with its status, size, and index time, and suggests the next useful command. If several projects are indexed from the same directory, it shows the most recently indexed one and lists the others. If the index was built before the backend tracked index generations, paging cursors and coverage checks do not work, so the dashboard says so and puts the rebuild command first.

If the repository is not indexed, the agent indexes it with `index_repository`. For sustained exploration, the codebase-memory-mcp daemon can be started separately so repeated commands do not each pay backend startup cost.

## Explore the codebase

Agents usually orient with the project list, index status, and graph schema. They can then:

- search graph symbols and source code;
- list the declarations of one file before reading it;
- retrieve an exact source snippet after finding a symbol;
- trace callers, callees, and other relationships;
- inspect a project architecture summary;
- detect changes and estimate affected symbols;
- compare two indexed snapshots of a codebase;
- inspect index coverage when missing search results need investigation;
- run direct graph queries for questions not covered by a focused command.

The generic `tool` command also forwards operations added by newer codebase-memory-mcp versions, so agents can use new backend capabilities before cbm-axi adds a named command.

The CLI help is the usage reference for agents. `cbm-axi --help` lists every command by the question it answers, plus the rules for reading results, paging, exit codes, and which commands change state. `cbm-axi <command> --help` adds that command's upstream flags, the cbm-axi output flags, and command-specific notes. The skill and the dashboard point agents to this help instead of repeating it.

## Read results and recover from errors

cbm-axi always asks the backend for JSON and renders it as compact TOON, so upstream column-and-row tables become TOON tables. Upstream keeps its default fields lean, and cbm-axi keeps all of them. It only drops bookkeeping that repeats the default or another field: exact-total markers, a `count` equal to `returned`, zero offsets, `truncated: false`, plain page-limit truncation that `has_more` already states, and timing diagnostics. Search scores are rounded to four significant digits. `--full` shows the complete upstream response. `search_graph` defaults to 20 results; other commands use upstream page sizes. Agents can select fields of the main result list with `--fields`. Long text is previewed, and `--full` shows it whole. Code snippets are not previewed because upstream already limits their size and reports how to continue them.

When a response has more rows, cbm-axi prints the exact next command. It carries the upstream offset or cursor, keeps the original arguments, and keeps the agent's argument style: flags stay flags, and a raw JSON object stays raw JSON. A request made with `--args-file` continues as raw JSON, because the backend ignores other flags next to an args file. After non-empty search, file outline, or indexing results, cbm-axi also suggests the usual next command, with placeholders for values the agent picks from the results. Empty results say which project was searched. cbm-axi manages `--format` itself and rejects it as an argument.

Successful results and errors use structured stdout. Invalid usage exits with code 2, including argument errors reported by the backend. Operational failures exit with code 1. Recovery hints point the agent toward relevant cbm-axi help, filters, indexing, or installation steps. Deleting a project that is already absent succeeds.

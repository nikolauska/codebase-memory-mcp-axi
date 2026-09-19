# How cbm-axi works

cbm-axi is an [Agent eXperience Interface (AXI)](https://github.com/kunchenguid/axi) for codebase-memory-mcp. It gives AI agents a compact command-line interface for indexing and exploring source-code graphs.

AXI tools are designed for AI agents rather than human-first terminal use. cbm-axi turns codebase-memory-mcp operations into structured commands with token-efficient output, predictable errors, and contextual next steps.

## Install cbm-axi

cbm-axi requires Node.js 24 or newer and codebase-memory-mcp 0.10.2 or newer. Install both commands globally with npm:

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

An AI agent starts by checking cbm-axi from the repository it needs to understand. The dashboard reports whether the current directory belongs to an indexed project and suggests the next useful command.

If the repository is not indexed, the agent indexes it with `index_repository`. For sustained exploration, the codebase-memory-mcp daemon can be started separately so repeated commands do not each pay backend startup cost.

## Explore the codebase

Agents usually orient with the project list, index status, and graph schema. They can then:

- search graph symbols and source code;
- retrieve an exact source snippet after finding a symbol;
- trace callers, callees, and other relationships;
- inspect a project architecture summary;
- detect changes and estimate affected symbols;
- inspect index coverage when missing search results need investigation;
- run direct graph queries for questions not covered by a focused command.

The generic `tool` command also forwards operations added by newer codebase-memory-mcp versions, so agents can use new backend capabilities before cbm-axi adds a named command.

## Read results and recover from errors

cbm-axi returns compact TOON output. Searches default to 20 results, common collections include only their most useful fields, and long text is shortened by default. Agents can select fields with `--fields`, request complete detail with `--full`, and follow emitted pagination guidance when more results are available.

Successful results and errors use structured stdout. Operational failures and invalid usage have distinct exit codes, and recovery hints point the agent toward relevant help, filters, indexing, or installation steps.

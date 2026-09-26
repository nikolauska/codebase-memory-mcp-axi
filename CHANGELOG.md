# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Added `get_file_outline` and `compare_graphs` commands for the new
  codebase-memory-mcp 0.11 tools.
- Next-page commands now carry upstream offsets and cursors for every paged
  list, including `search_code` results, `detect_changes` sections, snippet
  members and source lines, ADR headings, and coverage paths.
- Suggest the usual next command after non-empty `search_graph`,
  `search_code`, `get_file_outline`, and `index_repository` results.
- The dashboard flags an index built before generation tracking and puts its
  rebuild command first.
- The dashboard lists other projects indexed from the same directory and shows
  the most recently indexed one.

### Changed

- Require `codebase-memory-mcp` 0.11.0 or newer.
- Request JSON from the backend and render upstream column-and-row tables as
  TOON tables. `--format` is now managed by cbm-axi and rejected as an argument.
- Use upstream's lean default fields instead of cbm-axi column selections;
  `--fields` now applies to the main result list only.
- Stop previewing code snippet source, which upstream already bounds and
  continues with `--start-line`.
- Report backend argument errors as usage errors with exit code 2 and point
  help at `cbm-axi <command> --help`.
- Adapt tool help to cbm-axi usage and list the `--fields` and `--full` flags.
- Top-level help now describes each command by the question it answers and
  lists the rules for reading results, paging, exit codes, and state-changing
  commands; each command's help adds command-specific notes.
- Show only freshness and size in the dashboard; details stay in
  `index_status`.
- Drop upstream bookkeeping that repeats defaults or other fields, and round
  search scores to four significant digits. `--full` keeps the complete
  response.
- Shortened the cbm-axi skill to point agents at the CLI help and dashboard,
  keeping only the prerequisites and the commands that need the user's request.

### Fixed

- Fixed output against codebase-memory-mcp 0.11, whose default text layout
  was shown as one truncated string.
- Fixed the dashboard not finding the current project.
- Fixed deleting an absent project failing instead of succeeding as a no-op.
- Fixed raw JSON and `--args-file` requests losing flags that cbm-axi adds.

## [0.7.2] - 2026-09-07

### Fixed

- Let `codebase-memory-mcp` manage its runtime directory instead of creating
  and selecting a wrapper-specific directory below `XDG_RUNTIME_DIR`.

### Changed

- Updated dependencies to their current versions.

## [0.7.1] - 2026-08-23

### Fixed

- Create the private backend runtime directory before launching
  `codebase-memory-mcp` so secure CLI coordination can create its endpoint.

## [0.7.0] - 2026-08-23

### Fixed

- Use a backend runtime directory below `XDG_RUNTIME_DIR` so secure local
  socket validation does not reject a world-writable `/tmp` parent, while
  preserving explicit `CBM_RUNTIME_DIR` overrides.

## [0.6.0] - 2026-08-12

### Added

- Added `check_index_coverage` for on-demand v0.10 graph completeness checks.

### Changed

- Require `codebase-memory-mcp` 0.10.2 or newer and forward upstream CLI flags
  directly.

## [0.5.0] - 2026-08-03

### Removed

- Removed the native Pi extension, its plugin manifests, and bundled
  `codebase-memory-mcp` backend dependency. Use the standalone `cbm-axi` CLI
  with an installed upstream backend.

## [0.4.0] - 2026-07-20

### Added

- Added a native pi package extension that exposes compact codebase-memory
  queries through the `cbm_axi` tool.
- Added the npm-distributed `codebase-memory-mcp` backend so pi and standalone
  installs no longer require a separate executable installation.

## [0.3.1] - 2026-07-16

### Fixed

- Fixed release-tag version validation so npm publication can run in GitHub
  Actions.

## [0.3.0] - 2026-07-16

### Changed

- Replaced the Go implementation and bundled platform binaries with a Node.js
  24+ TypeScript CLI.
- Adopted `axi-sdk-js` for command dispatch, TOON output, structured errors,
  self-updates, and session-start hook setup.
- Replaced `setup --agent` with `setup hooks` and removed the internal
  skill-printing flag.
- Switched development, CI, packaging, and npm-only releases to npm scripts.

### Removed

- Removed custom session-end capture and native binary distribution.

## [0.2.7] - 2026-07-14

### Fixed

- Tell agents to request elevated filesystem access when indexing cannot write
  to the user cache.

## [0.2.6] - 2026-07-14

### Added

- Publish `@nikolauska/cbm-axi` with bundled platform binaries.

## [0.2.5] - 2026-07-13

### Fixed

- Store plugin-managed graph caches in the plugin's writable data directory so
  sandboxed indexing does not require escalation.

## [0.2.2] - 2026-07-13

### Fixed

- Pinned plugin-managed `cbm-axi` and `codebase-memory-mcp` downloads to
  compatible releases and refresh them when their declared versions change.

## [0.2.1] - 2026-07-13

### Fixed

- Fixed MCP tool flags being forwarded directly instead of serialized as the
  backend's JSON argument object, including Windows repository paths.

## [0.2.0] - 2026-07-11

### Added

- Added Claude Code and Codex plugin marketplace manifests.
- Added plugin-local executable installation with SHA-256 verification.
- Added bundled session hooks using persistent plugin data instead of global
  PATH installs.

### Changed

- The plugin launcher can find `codebase-memory-mcp` beside the local `cbm-axi`
  binary.
- Legacy `cbm-axi setup` hooks remain available for non-plugin installations.

## [0.1.1] - 2026-07-10

### Added

- Added project-specific `AGENTS.md` and `CLAUDE.md` guidance for repository
  agents.

## [0.1.0] - 2026-07-10

### Added

- Added `cbm-axi`, a Go AXI wrapper around `codebase-memory-mcp`.
- Added compact TOON output, field projection, truncation, pagination hints,
  structured errors, and a read-only dashboard.
- Added user-level Claude Code, Codex, and OpenCode hook setup with session-end
  file capture.
- Added an installable agent skill, CI, cross-platform packaging, and tests.

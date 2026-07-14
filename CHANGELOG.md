# Changelog

All notable changes to this project are documented here.

## [0.2.7] - 2026-07-14

### Fixed

- Tell agents to request elevated filesystem access when indexing cannot write to the user cache.

## [0.2.6] - 2026-07-14

### Added

- Publish `@nikolauska/cbm-axi` with bundled platform binaries.

## [0.2.5] - 2026-07-13

### Fixed

- Store plugin-managed graph caches in the plugin's writable data directory so sandboxed indexing does not require escalation.

## [0.2.2] - 2026-07-13

### Fixed

- Pinned plugin-managed `cbm-axi` and `codebase-memory-mcp` downloads to compatible releases and refresh them when their declared versions change.

## [0.2.1] - 2026-07-13

### Fixed

- Fixed MCP tool flags being forwarded directly instead of serialized as the backend's JSON argument object, including Windows repository paths.

## [0.2.0] - 2026-07-11

### Added

- Added Claude Code and Codex plugin marketplace manifests.
- Added plugin-local executable installation with SHA-256 verification.
- Added bundled session hooks using persistent plugin data instead of global PATH installs.

### Changed

- The plugin launcher can find `codebase-memory-mcp` beside the local `cbm-axi` binary.
- Legacy `cbm-axi setup` hooks remain available for non-plugin installations.

## [0.1.1] - 2026-07-10

### Added

- Added project-specific `AGENTS.md` and `CLAUDE.md` guidance for repository agents.

## [0.1.0] - 2026-07-10

### Added

- Added `cbm-axi`, a Go AXI wrapper around `codebase-memory-mcp`.
- Added compact TOON output, field projection, truncation, pagination hints, structured errors, and a read-only dashboard.
- Added user-level Claude Code, Codex, and OpenCode hook setup with session-end file capture.
- Added an installable agent skill, CI, cross-platform packaging, and tests.

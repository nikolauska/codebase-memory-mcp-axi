# AGENTS.md
<!-- agents-md-version: 1 -->

## CRITICAL

- MUST: Use the repository Makefile for build, install, test, lint, and release tasks.
- MUST: Run `make lint` before committing.
- MUST: Run `make test` before opening a pull request.
- MUST: Run `make check-skill` when changing `skills/cbm-axi/`.
- MUST: Update both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` whenever changing the release version.
- NEVER: Add third-party dependencies without updating `go.mod` and `go.sum` deliberately; this project currently uses only the standard library.
- NEVER: Commit `cbm-axi` or `dist/`; they are generated release outputs.
- NEVER: Read, log, or commit secrets, credentials, or user configuration contents.
- NEVER: Skip hooks with `--no-verify` or force-push shared branches.
- PREFER: Use repository-aware file editing and `rg`/`rg --files` for exact source and file discovery.
- ON FAIL: Read the complete error output, confirm the upstream `codebase-memory-mcp` prerequisite, then retry the narrowest failing Make target.

## Domain & Context

- Goal: Provide an agent-oriented Go CLI that wraps the installed `codebase-memory-mcp` executable and emits compact TOON output.
- Type: CLI/Tool
- License: MIT
- Key Terms:
  - `TOON`: The compact tabular output format printed by `cbm-axi`.
  - `upstream CLI`: The installed `codebase-memory-mcp` executable invoked internally with JSON output.
  - `user hooks`: Claude Code, Codex, and OpenCode session integrations configured by `cbm-axi setup`.

## Data & State

- Backend source of truth: The upstream `codebase-memory-mcp` process and its configured graph storage.
- User integrations: `~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.codex/config.toml`, and `~/.config/opencode/plugins/cbm-axi.ts`.
- Session capture: User cache data written by `captureSession` in `setup.go`.

## Execution Context

- Run on: Host
- Prefix: N/A; `codebase-memory-mcp` must be on `PATH` for live commands.
- Releases: GitHub Actions packages binaries when a `v*` tag is pushed.

## Commands

```bash
# install
make install                 # ON FAIL: verify Go 1.22+ and the writable install directory.
# test
make test                    # ON FAIL: rerun focused tests with `GO111MODULE=off go test -run '^Test' .`.
# lint
make lint                    # ON FAIL: run `make fmt`, then rerun `make lint`.
# format
make fmt                     # ON FAIL: inspect the reported gofmt or filesystem error.
# skill validation
make check-skill              # ON FAIL: run `make build` and compare `go run . --print-skill` with the skill file.
# build
make build                   # ON FAIL: verify the Go toolchain and inspect compiler output.
# release binaries
make dist VERSION=v0.1.0     # ON FAIL: inspect the first cross-compilation error and rerun after fixing it.
```

## Structure

```
main.go                       # CLI dispatch and upstream adapter
setup.go                      # user hook configuration and session capture
toon.go                       # standard-library TOON encoder
skill.go                      # embedded skill output
main_test.go                  # unit and integration-style tests
skills/cbm-axi/               # installable agent skill
.github/workflows/ci.yml      # CI and tag release workflow
cbm-axi                       # generated local binary; do not edit
dist/                         # generated release binaries; do not edit
```

## Patterns

- **Module:** Go module `github.com/nikolauska/codebase-memory-mcp-axi`; use standard-library packages for new code unless a dependency is justified.
- **Async:** Synchronous command execution with `os/exec`; use direct return values and errors for new code.
- **Naming:** Lowercase Go filenames, `_test.go` test suffixes, exported Go identifiers only when package API visibility requires them, and descriptive camelCase functions.
- **CLI output:** Keep stdout machine-readable TOON or structured errors; send diagnostics to stderr and preserve exit codes `0`, `1`, and `2`.
- **Backend boundary:** Keep upstream process invocation and JSON decoding in the adapter layer; keep rendering and hook setup separate.

## Search

- Exact source: `rg "pattern" --glob '*.go' .`
- Files: `rg --files -g '*.go' -g '*.md' -g 'Makefile'`
- Symbol discovery: `rg '^(func|type|const|var) ' --glob '*.go' .`

## Testing Strategy

- Runner: Go tests through `make test`.
- Tests: `main_test.go`; use focused `go test -run TestName .` for failures.
- Fixtures: In-memory values and temporary home directories; no external test fixture service.
- Coverage: No configured threshold.
- E2E: Live upstream behavior is checked manually with an installed `codebase-memory-mcp` binary.

## Security

- NEVER read or commit `.env`, credential files, private keys, or user hook configuration contents.
- NEVER overwrite unrelated OpenCode plugins; `setup.go` only replaces its own marked plugin.
- Backend diagnostics are suppressed from stdout and upstream logging is disabled with `CBM_LOG_LEVEL=none`.

## Env

- Go: Version declared by `go.mod` (`1.22`).
- Upstream backend: `codebase-memory-mcp` executable on `PATH` for live operation.
- Install location: `GOBIN` if set, otherwise the active Go `GOPATH/bin`.
- User home: `HOME` determines hook and session-cache paths used by `setup`.

## Debugging

- Help: `cbm-axi --help` or `cbm-axi <tool> --help`.
- Version: `cbm-axi --version`.
- Diagnostics: Read stderr while keeping stdout reserved for TOON and structured errors.
- Backend failures: Confirm `codebase-memory-mcp` is installed and run its delegated help command.

## Git

- Branch: Use short feature branches such as `feat/<topic>` or `fix/<topic>`; release tags use `v<semver>`.
- Commits: Use small conventional commits such as `feat: add adapter` or `fix: correct install output name`; explain what changed and why.
- Hooks: No repository-managed hook configuration detected; do not use `--no-verify`.
- PR: `make lint`, `make test`, `make check-skill`, and `make build` must pass.

## CI

- Checks: GitHub Actions runs lint, tests, skill validation, and build on pushes and pull requests.
- Release: A `v*` tag waits for checks, builds six platform/architecture binaries, and creates a GitHub release with generated notes.
- Artifacts: Release binaries are emitted under `dist/`.

## Tool Preferences

| Task | Prefer | Avoid |
|------|--------|-------|
| Edit source | Repository-aware patch/editor | Shell redirection or generated-file edits |
| Discover files | `rg --files` | `find`/recursive directory dumps |
| Search text | `rg` | `grep` when `rg` is available |
| Validate changes | `make lint test check-skill build` | Skipping targeted checks |

# AGENTS.md
<!-- agents-md-version: 1 -->

## CRITICAL

- MUST: Use npm; `package-lock.json` is authoritative. Do not use yarn, pnpm, or bun.
- MUST: Run `npm run lint` before committing.
- MUST: Run `npm test` before opening a pull request.
- MUST: Keep `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` versions aligned for releases.
- NEVER: Run `npm publish` locally; tagged CI releases own publication.
- NEVER: Commit `dist/` or `node_modules/`; they are generated outputs.
- NEVER: Read, log, or commit secrets, credentials, private keys, or user configuration contents.
- NEVER: Skip hooks with `--no-verify` or force-push shared branches.
- PREFER: `rg`/`rg --files` for discovery and repository-aware patches for edits.
- ON FAIL: Read the complete output, fix the narrowest reported cause, then rerun only the failing npm script.

## Domain & Context

- Goal: Provide an agent-oriented Node.js CLI that wraps an installed graph backend and emits compact TOON output.
- Type: Single-package CLI/Tool
- License: MIT
- Key Terms:
  - `TOON`: Compact structured output serialized by `axi-sdk-js`.
  - `upstream CLI`: The installed graph executable invoked internally with JSON output.
  - `session hooks`: Optional Claude Code, Codex, and OpenCode integrations installed by `cbm-axi setup hooks`.

## Data & State

- Backend source of truth: The upstream CLI process and its configured graph storage.
- User integrations: Hook files managed by `axi-sdk-js`; tests must use temporary directories or injected installers.
- CLI state: Stateless except for explicit hook installation and SDK self-update commands.

## Execution Context

- Run on: Host
- Prefix: N/A; Node.js 24+ and the upstream CLI must be on `PATH`.
- Releases: Tagged GitHub Actions runs publish the npm package and create release notes.

## Commands

```bash
# install
npm ci                         # ON FAIL: verify Node 24+, registry access, and the first lockfile diagnostic.
# lint
npm run lint                   # ON FAIL: fix the first TypeScript or node --check diagnostic, then rerun npm run lint.
# test
npm test                       # ON FAIL: run node --test --test-name-pattern '<name>' test/cbm-axi.test.js, then rerun npm test.
# build
npm run build                  # ON FAIL: run npm run lint to isolate type errors, then rerun npm run build.
# package preview
npm pack --dry-run             # ON FAIL: run npm run build, verify package.json files, then rerun npm pack --dry-run.
```

## Structure

```
src/bin/                       # Executable entrypoint
src/cli.ts                     # CLI and adapter logic
test/                          # Node test suite
skills/cbm-axi/                # Installable agent skill
hooks/                         # Plugin session hooks
.claude-plugin/                # Claude plugin metadata
.codex-plugin/                 # Codex plugin metadata
.github/workflows/ci.yml       # CI and npm release
package.json                   # npm scripts and metadata
tsconfig.json                  # TypeScript compiler config
mise.toml                      # Node runtime pin
dist/                          # Compiled JavaScript (generated -- do not edit)
```

## Patterns

- **Module:** Use ESM TypeScript with `.js` extensions in relative imports; never add CommonJS source.
- **Async:** Use async/await and Promise-returning backend adapters for new asynchronous logic.
- **Naming:** Use lowercase filenames, camelCase functions, PascalCase types, and UPPER_SNAKE_CASE constants.
- **CLI runtime:** Register commands through `runAxiCli`; return plain objects and throw `AxiError` rather than rendering output manually.
- **Backend boundary:** Keep process invocation and JSON-envelope decoding in the adapter flow; keep projection and truncation independent of subprocess details.
- **Dependencies:** Prefer Node standard-library modules; add runtime packages only when requested and commit lockfile changes deliberately.

## Search

- Exact source: `rg "pattern" --glob '*.ts' --glob '*.js' .`
- Files: `rg --files -g '*.ts' -g '*.js' -g '*.md' -g '*.json'`
- Symbols: `rg '^(export )?(async )?(function|class|interface|type|const) ' src test`

## Testing Strategy

- Runner: Node's built-in `node:test` through `npm test`.
- Tests: `test/cbm-axi.test.js` imports compiled output from `dist/`.
- Fixtures: Injected backend runners, captured stdout, and temporary user paths; never depend on live user configuration.
- Coverage: No configured threshold.
- Live check: Run the installed CLI manually only when the upstream executable is available.

## Security

- NEVER read or commit `.env`, credential files, private keys, npm tokens, or user hook configuration contents.
- NEVER overwrite unmanaged OpenCode plugins; delegate user hook ownership checks to `axi-sdk-js`.
- Keep diagnostics out of successful structured output and disable upstream logging in the child-process environment.

## Env

- Node.js: `24` in `mise.toml`; package minimum `>=24`.
- Package manager: npm with committed `package-lock.json`.
- TypeScript: Compiles `src/` to ignored `dist/` using `tsconfig.json`.

## Git

- Branch: Use short branches such as `feat/<topic>` or `fix/<topic>`.
- Commit: Use conventional subjects such as `feat: add adapter`; explain what changed and why without co-author trailers.
- Hooks: User-managed; never bypass repository or user hooks. No repository hook runner is configured.
- PR: Require `npm run lint`, `npm test`, and `npm pack --dry-run`.

## CI

- Checks: Node.js 24 install, lint, tests, and npm package preview on pushes and pull requests.
- Release: A `v*` tag publishes npm provenance and creates generated GitHub release notes.
- Artifacts: None uploaded; `v*` releases publish the npm package and no native binaries.

## Tool Preferences

| Task | Prefer | Avoid |
|------|--------|-------|
| Edit source | Repository-aware patch/editor | Shell redirection or generated output edits |
| Discover files | `rg --files` | `find` or recursive directory dumps |
| Search text | `rg` | `grep` when `rg` is available |
| Validate changes | npm scripts from `package.json` | Ad hoc compiler or test commands |

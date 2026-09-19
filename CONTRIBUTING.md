# Contributing

cbm-axi requires Node.js 24 or newer and uses npm.

## Set up the repository

Install the locked dependencies from `package-lock.json`:

```sh
npm ci
```

`npm run build` compiles the JavaScript published from `dist/`. Tests use injected backend runners, so routine development does not require a live codebase-memory-mcp installation.

## Validate changes

Run the relevant focused checks while developing, then run the complete project checks before committing or opening a pull request:

```sh
npm run fmt:check
npm run lint
npm test
npm pack --dry-run
```

These commands verify formatting, lint rules, types, tests, and the contents of the npm package. The test command builds the project before running the Node.js test suite.

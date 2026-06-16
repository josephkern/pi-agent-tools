# @josephakern/pi-tree-sitter-cli

Thin pi extension for exposing the existing `tree-sitter` CLI to agents.

## Contract

This package does not install, bundle, or vendor Tree-sitter. It requires an existing `tree-sitter` executable on `PATH`, or an explicit `TREE_SITTER_BIN=/absolute/path/to/tree-sitter`.

If the executable is missing, tools fail with installation/configuration guidance instead of silently falling back or attempting auto-installation.

## Principle

Expose the tool, do not domesticate it. Tree-sitter's query language is the abstraction; this package should stay a safe, capped, convenient doorway to the CLI.

## Status

First thin slice:

- `tree_sitter_languages` — wraps `tree-sitter dump-languages`

Planned from `../../PLAN.md`:

- `tree_sitter_parse`
- `tree_sitter_query`
- `tree_sitter_tags`

## Development

From the repository root:

```bash
npm install
npm run check
```

Temporary pi load:

```bash
pi -e ./packages/pi-tree-sitter-cli/src/index.ts
```

Project-local install once stable:

```bash
pi install -l ./packages/pi-tree-sitter-cli
```

Set `TREE_SITTER_BIN` if `tree-sitter` is not on `PATH`.

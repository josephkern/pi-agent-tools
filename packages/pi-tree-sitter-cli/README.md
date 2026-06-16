# @josephakern/pi-tree-sitter-cli

Thin pi extension for exposing the existing `tree-sitter` CLI to agents.

## Contract

This package does not install, bundle, or vendor Tree-sitter itself. It requires an existing `tree-sitter` executable on `PATH`, or an explicit `TREE_SITTER_BIN=/absolute/path/to/tree-sitter`.

If the executable is missing, tools fail with installation/configuration guidance instead of silently falling back or attempting auto-installation.

Optional grammar acquisition is explicit: `tree_sitter_grammar_install` installs npm grammar packages into a tool-local cache and writes a tool-local Tree-sitter config. It does not mutate your global Tree-sitter config. Tree-sitter and npm cache paths are also kept under the tool-local cache when these tools execute.

## Principle

Expose the tool, do not domesticate it. Tree-sitter's query language is the abstraction; this package should stay a safe, capped, convenient doorway to the CLI.

## Status

Implemented:

- `tree_sitter_languages` — wraps `tree-sitter dump-languages`
- `tree_sitter_parse` — wraps `tree-sitter parse`
- `tree_sitter_query` — wraps `tree-sitter query`
- `tree_sitter_tags` — wraps `tree-sitter tags`
- `tree_sitter_grammar_status` — inspects the tool-local grammar cache
- `tree_sitter_grammar_install` — explicitly installs npm grammar packages into the tool-local cache

The minimal Tree-sitter CLI plan from `../../PLAN.md` is implemented, plus optional tool-local npm grammar management.

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

Set `TREE_SITTER_BIN` if `tree-sitter` is not on `PATH`. Set `PI_TREE_SITTER_CLI_HOME` to override the managed grammar cache directory.

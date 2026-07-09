# @josephakern/pi-tree-sitter-cli

Thin pi extension for exposing the existing `tree-sitter` CLI to agents.

## Installation

Install this package by itself from npm:

```bash
pi install npm:@josephakern/pi-tree-sitter-cli
```

Install it for the current project instead of globally:

```bash
pi install -l npm:@josephakern/pi-tree-sitter-cli
```

Try it for one pi run without saving it to settings:

```bash
pi -e npm:@josephakern/pi-tree-sitter-cli
```

For local development from this monorepo:

```bash
pi install -l ./packages/pi-tree-sitter-cli
```

This pi package exposes Tree-sitter, but it does not install the `tree-sitter` CLI or language grammars. Install the CLI and any globally available grammars with npm, for example:

```bash
npm install -g tree-sitter-cli tree-sitter-typescript tree-sitter-python
```

Then confirm Tree-sitter can discover them:

```bash
tree-sitter dump-languages
```

## Contract

This package does not install, bundle, or vendor Tree-sitter itself. It requires an existing `tree-sitter` executable on `PATH`, or an explicit `TREE_SITTER_BIN=/absolute/path/to/tree-sitter`.

At runtime, pi provides the pi extension peer packages used by this package: `@earendil-works/pi-coding-agent` and `typebox`. The external `tree-sitter` CLI and language grammar packages are separate system/npm installs.

If the executable is missing, tools fail with installation/configuration guidance instead of silently falling back or attempting auto-installation.

Child processes are capped: runs are killed (process group and all) on timeout, and a run that produces more than 2MB of output is terminated with the captured prefix returned plus an explicit incompleteness notice (a capped grammar install is treated as a failure instead). Positional arguments (`paths`, `queryFile`) are passed after a `--` terminator so they can never be parsed as CLI flags; npm `packages` specs must not start with `-`.

Optional grammar acquisition is explicit: `tree_sitter_grammar_install` installs npm grammar packages into a tool-local cache and writes a tool-local Tree-sitter config. It does not mutate your global Tree-sitter config. Tree-sitter and npm cache paths are also kept under the tool-local cache when these tools execute.

## Grammar installation options

Tree-sitter discovers grammars from the `parser-directories` listed in its config. If you want a grammar to behave like the globally available Python grammar, install the npm grammar package into a directory already listed in the default Tree-sitter config, commonly the active global npm prefix:

```bash
npm install -g tree-sitter-typescript tree-sitter-javascript tree-sitter-rust
```

Then verify:

```bash
tree-sitter dump-languages
```

Grammars installed this way are available to the default tool calls, without `useManagedConfig`.

For isolated, tool-local installation, use this package's managed cache instead:

```json
{
  "packages": ["tree-sitter-typescript"],
  "allowScripts": true
}
```

via `tree_sitter_grammar_install`, then call the other Tree-sitter tools with:

```json
{
  "useManagedConfig": true
}
```

Use `tree_sitter_languages` to inspect the default config and `tree_sitter_grammar_status` to inspect the managed cache.

## Principle

Expose the tool, do not domesticate it. Tree-sitter's query language is the abstraction; this package should stay a safe, capped, convenient doorway to the CLI.

## Status

Implemented:

- `tree_sitter_languages` — wraps `tree-sitter dump-languages`
- `tree_sitter_parse` — wraps `tree-sitter parse`
- `tree_sitter_query` — wraps `tree-sitter query`; pass `compact: true` for token-efficient capture lines
- `tree_sitter_tags` — wraps `tree-sitter tags`; pass `compact: true` for token-efficient tag lines
- `tree_sitter_grammar_status` — inspects the tool-local grammar cache
- `tree_sitter_grammar_install` — explicitly installs npm grammar packages into the tool-local cache

The minimal Tree-sitter CLI plan from [`PLAN.md`](./PLAN.md) is implemented, plus optional tool-local npm grammar management.

## Query recipes

This package also ships a small recipe catalog. Recipes are plain `.scm` files plus the `tree-sitter-recipes` skill; they do not wrap or replace the raw tools.

Included query files:

```text
queries/
  universal/syntax-errors.scm
  typescript/function-signatures.scm
  typescript/imports.scm
  typescript/exports.scm
  typescript/type-declarations.scm
  typescript/tool-registrations.scm
  javascript/function-signatures.scm
  python/function-signatures.scm
  python/imports.scm
  python/exports.scm
  python/type-declarations.scm
```

The skill recommends using `tree_sitter_tags` first for navigation, then `tree_sitter_query` with a recipe file when richer captures are needed.

For project-specific patterns, prefer adding `.scm` files under `.pi/tree-sitter/queries/` or `tree-sitter/queries/` instead of adding wrapper tools.

## Development

From the repository root:

```bash
npm install
npm run check
```

Temporary pi load:

```bash
pi -e ./packages/pi-tree-sitter-cli
```

Project-local install once stable:

```bash
pi install -l ./packages/pi-tree-sitter-cli
```

Set `TREE_SITTER_BIN` if `tree-sitter` is not on `PATH`. Set `PI_TREE_SITTER_CLI_HOME` to override the managed grammar cache directory.

# Agent Tools

The key idea is: agents should not rely only on reading and guessing. They should continuously ask specialized tools for structural facts, lint facts, type facts, and runtime facts.
The most efficient code is the code that is never written, maintained, or run.
Expose the tool, do not domesticate it. The language is the abstraction; the plugin should mostly be a safe, capped, convenient doorway to the tool.

## Monorepo layout

```text
packages/
  pi-tree-sitter-cli/   Thin pi extension exposing the tree-sitter CLI
  pi-gh-cli/            Thin pi extension exposing the GitHub CLI
```

## Tree-sitter grammar installation

The `tree-sitter` CLI only sees grammars from the parser directories in its config. In this environment, the Python grammar is available because it was installed with npm into the pi-managed global npm prefix, and the Tree-sitter config includes that global `node_modules` directory.

To install additional grammars the same way:

```bash
npm install -g tree-sitter-typescript tree-sitter-javascript tree-sitter-rust
```

Then verify availability:

```bash
tree-sitter dump-languages
```

Grammars installed this way are available to the default Tree-sitter config, so agents can use `tree_sitter_parse`, `tree_sitter_query`, and `tree_sitter_tags` without `useManagedConfig`.

The `pi-tree-sitter-cli` package also supports an isolated managed grammar cache via `tree_sitter_grammar_install`; grammars installed that way require passing `useManagedConfig: true` to the Tree-sitter tools.

## Development

```bash
npm install
npm run check
```

Temporary extension load while developing:

```bash
pi -e ./packages/pi-tree-sitter-cli/src/index.ts
```

Project-local install once stable:

```bash
pi install -l ./packages/pi-tree-sitter-cli
```

See `PLAN.md` for the Tree-sitter tool plan.

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

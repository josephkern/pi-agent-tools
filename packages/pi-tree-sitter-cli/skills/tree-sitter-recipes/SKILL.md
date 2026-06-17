---
name: tree-sitter-recipes
description: Use raw Tree-sitter CLI tools with shipped and project .scm query recipes. Prefer tags first, then query recipes for richer shapes like signatures and imports.
---

# Tree-sitter Recipes

Use this skill when a user asks for structural code facts and the raw `tree_sitter_*` tools are available.

## Default workflow

1. Run `tree_sitter_languages` to confirm parser availability. Use `useManagedConfig=true` when relying on grammars installed with `tree_sitter_grammar_install`.
2. Run `tree_sitter_tags` first for outlines, definitions, references, and calls when a grammar provides `queries/tags.scm`.
3. Use `tree_sitter_query` with a recipe `.scm` file when tags are too coarse or when the user needs richer shape, such as parameters, return annotations, imports, or tool registrations.
4. Use `tree_sitter_parse` on a representative file or reduced snippet when a recipe fails, then adapt the query to the grammar node names.
5. Summarize captures for the user. Tree-sitter CLI rows are zero-based; convert to one-based line numbers in prose.

## Shipped query recipes

Resolve these paths relative to this skill directory.

| Task | Query file | Notes |
| --- | --- | --- |
| Syntax errors | `../../queries/universal/syntax-errors.scm` | Captures `@syntax.error` and `@syntax.missing`; works across most grammars. |
| TypeScript signatures | `../../queries/typescript/function-signatures.scm` | Captures `@signature.name`, `@signature.params`, `@signature.return`. |
| TypeScript imports | `../../queries/typescript/imports.scm` | Captures import sources/default/named/namespace imports. |
| pi tool registrations | `../../queries/typescript/tool-registrations.scm` | Finds `pi.registerTool({ name: ... })` calls. |
| JavaScript signatures | `../../queries/javascript/function-signatures.scm` | Captures names and params; JavaScript has no return type syntax. |
| Python signatures | `../../queries/python/function-signatures.scm` | Captures function/method names, params, and return annotations. |

Example:

```text
tree_sitter_query(
  queryFile="packages/pi-tree-sitter-cli/queries/typescript/function-signatures.scm",
  paths=["src/index.ts"],
  useManagedConfig=true,
  captures=true
)
```

## Capture contracts

Prefer stable semantic capture names across language-specific recipes:

- `@signature.name`
- `@signature.params`
- `@signature.return`
- `@import.source`
- `@import.default`
- `@import.name`
- `@import.alias`
- `@import.namespace`

The `.scm` files remain grammar-specific, but shared capture names let the agent summarize output uniformly.

## Project and user recipes

Do not add wrapper tools just to encode a structural pattern. For repeated project-specific patterns, create or use `.scm` files instead.

Recommended project-local locations:

```text
.pi/tree-sitter/queries/<language>/<task>.scm
tree-sitter/queries/<language>/<task>.scm
```

Use `.pi/tree-sitter/queries` for pi-specific project recipes. Use `tree-sitter/queries` when the queries should be obvious to non-pi tooling too.

When creating a new recipe:

1. Inspect a representative syntax tree with `tree_sitter_parse`.
2. Start with a small inline query.
3. Validate with `tree_sitter_query(..., captures=true)`.
4. Save it as a `.scm` file only if it is likely to be reused.
5. Prefer the shared capture contracts above when possible.

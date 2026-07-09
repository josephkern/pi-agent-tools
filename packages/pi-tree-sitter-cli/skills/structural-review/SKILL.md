---
name: structural-review
description: Review code or a diff using structural facts from Tree-sitter - parse health, syntax errors, and API surface (exports, signatures, types) - before reading whole files. Use when asked to review code, review a change, or assess a module's public API.
---

# Structural Review

Ground the review in structural facts first; read code bodies last. Resolve relative query paths against this skill's directory.

1. Parse health: `tree_sitter_parse` with `mode="json-summary"` on the files under review. Any unsuccessful parse is finding number one.
2. Locate syntax errors: `tree_sitter_query` with `../../queries/universal/syntax-errors.scm` on any file that failed.
3. API surface: run the language's exports and function-signatures recipes on the files (paths listed in the `tree-sitter-recipes` skill). Compare against the change to spot added, removed, or renamed public API the author may not have intended.
4. Type shape (TypeScript/Python): the type-declarations recipe for new or changed classes, interfaces, enums, and aliases.
5. Only now read code - and only the regions the facts point to. Scope with `rowRange`/`containingRowRange` instead of reading whole files.
6. Report findings with the `file:line:column` locations from `compact=true` output.

Structure is not semantics: pair with lint, type, and test tools for correctness claims. Do not present style opinions as structural facts.
